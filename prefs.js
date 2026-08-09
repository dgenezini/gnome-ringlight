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
            title: 'Border width',
            subtitle: 'White ring width around each monitor, in pixels',
            adjustment: new Gtk.Adjustment({
                lower: 1,
                upper: 1000,
                step_increment: 10,
            }),
        });
        settings.bind('border-width', widthRow.adjustment, 'value', Gio.SettingsBindFlags.DEFAULT);

        const radiusRow = new Adw.SpinRow({
            title: 'Corner radius',
            subtitle: 'Rounded ring corners; inner corner radius is this minus the ring width. 0 = sharp corners',
            adjustment: new Gtk.Adjustment({
                lower: 0,
                upper: 1000,
                step_increment: 10,
            }),
        });
        settings.bind('border-radius', radiusRow.adjustment, 'value', Gio.SettingsBindFlags.DEFAULT);

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
        group.add(radiusRow);
        group.add(paddingRow);
        group.add(availWidthRow);
        group.add(availHeightRow);
        page.add(group);
        window.add(page);
    }
}
