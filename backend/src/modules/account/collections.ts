import { DropModel } from '../clipboard/drop.model.js';
import { EncryptedItemModel } from '../encrypted/encrypted-item.model.js';
import { FocusSessionModel, HabitModel } from '../focus/focus.model.js';
import { PaletteModel } from '../palettes/palette.model.js';
import { PreferencesModel } from '../preferences/preferences.model.js';
import { SnippetModel } from '../snippets/snippet.model.js';
import { VaultModel } from '../vault/vault.model.js';

/** Every collection that stores per-user data. Add new owned collections here so export and delete cover them. */
export const userCollections = {
  preferences: PreferencesModel,
  vault: VaultModel,
  encryptedItems: EncryptedItemModel,
  snippets: SnippetModel,
  palettes: PaletteModel,
  focusSessions: FocusSessionModel,
  habits: HabitModel,
  drops: DropModel,
} as const;

/** Soft-deleted records older than this are removed for good. */
export const PURGE_AFTER_DAYS = 30;
