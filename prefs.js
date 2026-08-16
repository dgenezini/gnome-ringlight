// SPDX-License-Identifier: GPL-2.0-or-later
//
import Adw from 'gi://Adw';
import Gdk from 'gi://Gdk';
import Gio from 'gi://Gio';
import Gtk from 'gi://Gtk';

// GNOME 50 moved ExtensionPreferences to the Extensions daemon resource;
// 45-49 keep the shell one. Try new path, fall back to old.
let ExtensionPreferences;
try {
    ({ExtensionPreferences} =
        await import('resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js'));
} catch {
    ({ExtensionPreferences} =
        await import('resource:///org/gnome/shell/extensions/prefs.js'));
}

// display-global CSS for the temperature slider track; added once per process
let cssAdded = false;

export default class RingLightPreferences extends ExtensionPreferences {
    fillPreferencesWindow(window) {
        const settings = this.getSettings();

        const page = new Adw.PreferencesPage();
        const ringGroup = new Adw.PreferencesGroup({title: 'Ring'});
        const cursorGroup = new Adw.PreferencesGroup({title: 'Cursor'});
        const monitorGroup = new Adw.PreferencesGroup({title: 'Monitors'});
        const integrationGroup = new Adw.PreferencesGroup({title: 'Integration'});

        // color temperature slider: track painted with the yellow→white ramp
        // so the slider itself previews the ring color. Title/subtitle are
        // explicit labels in the body (row-type agnostic), scale below them.
        const tempRow = new Adw.PreferencesRow();
        const tempBox = new Gtk.Box({
            orientation: Gtk.Orientation.VERTICAL,
            spacing: 6,
            margin_top: 6,
            margin_bottom: 6,
            margin_start: 12, // match libadwaita's row > box.header inset
            margin_end: 12,
        });
        const tempTitle = new Gtk.Label({
            label: 'Ring color temperature',
            xalign: 0,
            wrap: true,
        });
        tempBox.append(tempTitle);
        const tempSubtitle = new Gtk.Label({
            label: 'Warm yellow (2700 K) to daylight white (6500 K); the slider track previews the color',
            xalign: 0,
            wrap: true,
        });
        tempSubtitle.add_css_class('dim-label');
        tempBox.append(tempSubtitle);
        const tempScale = new Gtk.Scale({
            adjustment: new Gtk.Adjustment({
                lower: 2700,
                upper: 6500,
                step_increment: 100,
            }),
            digits: 0, // draw_value label shows the Kelvin value
            draw_value: true,
            value_pos: Gtk.PositionType.BOTTOM,
            hexpand: true,
        });
        settings.bind('ring-color-temperature', tempScale.adjustment, 'value', Gio.SettingsBindFlags.DEFAULT);
        tempScale.add_css_class('ringlight-scale');
        const tempCss = new Gtk.CssProvider();
        tempCss.load_from_string(`scale.ringlight-scale trough {
            background-image: linear-gradient(to right, #ffa757, #ffb16e, #ffcea6, #fffefa);
            background-color: transparent;
            min-height: 8px;
        }
        scale.ringlight-scale trough highlight {
            background: transparent; /* kill the accent-blue fill covering the left of the ramp */
        }`);
        // provider is display-global; add once per process so repeated window
        // opens don't accumulate providers
        if (!cssAdded) {
            Gtk.StyleContext.add_provider_for_display(tempScale.get_display(), tempCss,
                Gtk.STYLE_PROVIDER_PRIORITY_APPLICATION);
            cssAdded = true;
        }
        tempBox.append(tempScale);
        tempRow.child = tempBox;

        const percentageRow = (title, subtitle, key) => {
            const row = new Adw.SpinRow({
                title,
                subtitle,
                adjustment: new Gtk.Adjustment({
                    lower: 0,
                    upper: 100,
                    step_increment: 1,
                }),
            });
            settings.bind(key, row.adjustment, 'value', Gio.SettingsBindFlags.DEFAULT);
            return row;
        };
        const brightnessRow = percentageRow(
            'Brightness', 'Light intensity, as a percentage', 'brightness');

        const quickSettingsRow = new Adw.SwitchRow({
            title: 'Show in Quick Settings',
            subtitle: 'Show Ring Light control in GNOME Quick Settings',
        });
        settings.bind('show-quick-settings-toggle', quickSettingsRow, 'active', Gio.SettingsBindFlags.DEFAULT);

        const monitors = Gdk.Display.get_default()?.get_monitors(); // GListModel; only monitor API in GTK 4 (45–50)
        for (let i = 0; monitors && i < monitors.get_n_items(); i++) {
            const connector = monitors.get_item(i).get_connector();
            if (!connector) {
                console.warn('Ring Light: no connector identity for monitor; cannot configure exclusion');
                continue;
            }
            const row = new Adw.SwitchRow({
                title: connector,
                subtitle: 'Show ring on this monitor',
                active: !settings.get_strv('excluded-monitors').includes(connector),
            });
            row.connect('notify::active', () => {
                const excluded = settings.get_strv('excluded-monitors')
                    .filter(name => name !== connector);
                if (!row.active)
                    excluded.push(connector);
                settings.set_strv('excluded-monitors', excluded);
            });
            monitorGroup.add(row);
        }

        const radiusRow = new Adw.SpinRow({
            title: 'Corner radius',
            subtitle: 'Rounded ring corners; inner corner radius is this minus the ring width. 0 = sharp corners',
            adjustment: new Gtk.Adjustment({
                lower: 0,
                upper: 200,
                step_increment: 10,
            }),
        });
        settings.bind('ring-radius', radiusRow.adjustment, 'value', Gio.SettingsBindFlags.DEFAULT);

        const cursorEnabledRow = new Adw.SwitchRow({
            title: 'Cursor transparency',
            subtitle: 'Fade the ring out under the pointer while it sits on the ring',
        });
        settings.bind('cursor-transparency', cursorEnabledRow, 'active', Gio.SettingsBindFlags.DEFAULT);

        const cursorRadiusRow = new Adw.SpinRow({
            title: 'Cursor radius',
            subtitle: 'Ring fades out inside this circle around the pointer, in pixels. 0 disables',
            adjustment: new Gtk.Adjustment({
                lower: 0,
                upper: 1000,
                step_increment: 10,
            }),
        });
        settings.bind('cursor-radius', cursorRadiusRow.adjustment, 'value', Gio.SettingsBindFlags.DEFAULT);

        const cursorFadeRow = new Adw.SpinRow({
            title: 'Cursor fade',
            subtitle: 'Soft-edge width of the cursor hole, in pixels. 0 gives a hard circular edge',
            adjustment: new Gtk.Adjustment({
                lower: 0,
                upper: 1000,
                step_increment: 10,
            }),
        });
        settings.bind('cursor-fade', cursorFadeRow.adjustment, 'value', Gio.SettingsBindFlags.DEFAULT);

        // radius/fade only matter while cursor transparency is on
        const updateCursorSensitivity = () => {
            const enabled = settings.get_boolean('cursor-transparency');
            cursorRadiusRow.sensitive = enabled;
            cursorFadeRow.sensitive = enabled;
        };
        settings.connect('changed::cursor-transparency', updateCursorSensitivity);
        updateCursorSensitivity();

        ringGroup.add(tempRow);
        ringGroup.add(brightnessRow);
        ringGroup.add(radiusRow);

        cursorGroup.add(cursorEnabledRow);
        cursorGroup.add(cursorRadiusRow);
        cursorGroup.add(cursorFadeRow);
        integrationGroup.add(quickSettingsRow);

        page.add(ringGroup);
        page.add(cursorGroup);
        page.add(monitorGroup);
        page.add(integrationGroup);
        window.add(page);
    }
}
