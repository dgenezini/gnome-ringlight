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

        const row = new Adw.SpinRow({
            title: 'Border width',
            subtitle: 'White ring width around each monitor, in pixels',
            adjustment: new Gtk.Adjustment({
                lower: 1,
                upper: 1000,
                step_increment: 10,
            }),
        });
        settings.bind('border-width', row.adjustment, 'value', Gio.SettingsBindFlags.DEFAULT);

        group.add(row);
        page.add(group);
        window.add(page);
    }
}
