// Minimal stand-in for the real ExtensionPreferences base class that
// prefs.js imports from the gnome-shell / Extensions-daemon resources
// (resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js on 50,
// resource:///org/gnome/shell/extensions/prefs.js on 45-49). Those resources
// live inside binaries a standalone GJS process cannot load, so the prefs
// test harness compiles this file into a .gresource registered at both
// resource paths. getSettings() mirrors the real base implementation so the
// driver exercises the real schema + dconf path end to end.
import Gio from 'gi://Gio';

export class ExtensionPreferences {
    constructor(metadata) {
        this.metadata = metadata;
    }

    get uuid() {
        return this.metadata.uuid;
    }

    getSettings(schema) {
        schema ||= this.metadata['settings-schema'];

        const schemaDir = this.metadata.dir.get_child('schemas');
        const defaultSource = Gio.SettingsSchemaSource.get_default();
        let schemaSource;
        if (schemaDir.query_exists(null)) {
            schemaSource = Gio.SettingsSchemaSource.new_from_directory(
                schemaDir.get_path(), defaultSource, false);
        } else {
            schemaSource = defaultSource;
        }

        const schemaObj = schemaSource.lookup(schema, true);
        if (!schemaObj)
            throw new Error(`Schema ${schema} could not be found for extension ${this.uuid}. Please check your installation`);

        return new Gio.Settings({settings_schema: schemaObj});
    }
}
