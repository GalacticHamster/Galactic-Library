import '../../shared/theme.js';
import {UI_PREFERENCES_KEY} from '../lib/ui-preferences.js';

// Tiny private preference reads bypass the library/validation path.
export function createAppearanceService(area,writer,runtime,ready=Promise.resolve()){
  return globalThis.GalacticHamsterTheme.createService({runtime,legacy:'dark',
    read:async()=>{await ready;const stored=await area.get({[UI_PREFERENCES_KEY]:null});const mode=stored[UI_PREFERENCES_KEY]?.appearance;return mode===undefined?null:{mode};},
    save:prefs=>writer.saveUiPreferences({appearance:prefs.mode})});
}
