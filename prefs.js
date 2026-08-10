// SPDX-License-Identifier: GPL-2.0-or-later
//
import Adw from 'gi://Adw';
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

export default class RingLightPreferences extends ExtensionPreferences {
    fillPreferencesWindow(window) {
        const settings = this.getSettings();

        const page = new Adw.PreferencesPage();
        const group = new Adw.PreferencesGroup({title: 'Ring'});

        const modeRow = new Adw.ComboRow({
            title: 'Ring width mode',
            subtitle: 'Fixed pixels, or derived from an available area resolution',
            model: new Gtk.StringList({strings: ['Pixels', 'Available resolution']}),
        });
        // settings → row
        const updateMode = () =>
            modeRow.selected = settings.get_string('width-mode') === 'resolution' ? 1 : 0;
        settings.connect('changed::width-mode', updateMode);
        updateMode();
        // row → settings
        modeRow.connect('notify::selected', () =>
            settings.set_string('width-mode', modeRow.selected === 1 ? 'resolution' : 'pixels'));

        const widthRow = new Adw.SpinRow({
            title: 'Ring width',
            subtitle: 'Ring width around each monitor, in pixels',
            adjustment: new Gtk.Adjustment({
                lower: 1,
                upper: 1000,
                step_increment: 10,
            }),
        });
        settings.bind('ring-width', widthRow.adjustment, 'value', Gio.SettingsBindFlags.DEFAULT);

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
        Gtk.StyleContext.add_provider_for_display(tempScale.get_display(), tempCss,
            Gtk.STYLE_PROVIDER_PRIORITY_APPLICATION);
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
            'Brightness', 'Maximum ring opacity, as a percentage', 'brightness');
        const softnessRow = percentageRow(
            'Softness', 'Gradient transition width; 0% is a hard edge', 'softness');
        const glowRow = percentageRow(
            'Glow', 'Outer glow strength and spread; 0% disables it', 'glow');

        const radiusRow = new Adw.SpinRow({
            title: 'Corner radius',
            subtitle: 'Rounded ring corners; inner corner radius is this minus the ring width. 0 = sharp corners',
            adjustment: new Gtk.Adjustment({
                lower: 0,
                upper: 1000,
                step_increment: 10,
            }),
        });
        settings.bind('ring-radius', radiusRow.adjustment, 'value', Gio.SettingsBindFlags.DEFAULT);

        const paddingRow = new Adw.SpinRow({
            title: 'Outside padding',
            subtitle: 'Gap between the ring and the monitor edges (top bar/docks), in pixels',
            adjustment: new Gtk.Adjustment({
                lower: 0,
                upper: 1000,
                step_increment: 1,
            }),
        });
        settings.bind('padding', paddingRow.adjustment, 'value', Gio.SettingsBindFlags.DEFAULT);

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

        const availWidthRow = new Adw.SpinRow({
            title: 'Available width',
            subtitle: 'Desired work area width; ring width derived from it (monitor width − this, halved per side)',
            adjustment: new Gtk.Adjustment({
                lower: 1,
                upper: 16384,
                step_increment: 10,
            }),
        });
        settings.bind('available-width', availWidthRow.adjustment, 'value', Gio.SettingsBindFlags.DEFAULT);

        const availHeightRow = new Adw.SpinRow({
            title: 'Available height',
            subtitle: 'Desired work area height; ring width derived from it (monitor height − this, halved per side)',
            adjustment: new Gtk.Adjustment({
                lower: 1,
                upper: 16384,
                step_increment: 10,
            }),
        });
        settings.bind('available-height', availHeightRow.adjustment, 'value', Gio.SettingsBindFlags.DEFAULT);

        // show only the rows for the active mode
        const updateVisibility = () => {
            const resMode = settings.get_string('width-mode') === 'resolution';
            widthRow.visible = !resMode;
            availWidthRow.visible = resMode;
            availHeightRow.visible = resMode;
        };
        settings.connect('changed::width-mode', updateVisibility);
        updateVisibility();

        group.add(modeRow);
        group.add(widthRow);
        group.add(tempRow);
        group.add(brightnessRow);
        group.add(softnessRow);
        group.add(glowRow);
        group.add(radiusRow);
        group.add(paddingRow);
        group.add(cursorRadiusRow);
        group.add(cursorFadeRow);
        group.add(availWidthRow);
        group.add(availHeightRow);
        page.add(group);
        window.add(page);
    }
}
