import { MAX_BOOKMARKS, MAX_RECENTS, type MergePreferencesBody, type Preferences } from '@uu/shared';
import { PreferencesModel, type PreferencesDoc } from './preferences.model.js';

const toPreferences = (doc: PreferencesDoc): Preferences => ({
  bookmarks: doc.bookmarks,
  recents: doc.recents,
  theme: doc.theme,
});

export async function getPreferences(userId: string): Promise<Preferences> {
  const doc = await PreferencesModel.findOneAndUpdate(
    { owner: userId },
    { $setOnInsert: { owner: userId } },
    { returnDocument: 'after', upsert: true },
  );
  return toPreferences(doc);
}

export async function replacePreferences(userId: string, body: MergePreferencesBody): Promise<Preferences> {
  const doc = await PreferencesModel.findOneAndUpdate({ owner: userId }, { $set: body }, { returnDocument: 'after', upsert: true });
  return toPreferences(doc);
}

const unique = (items: string[]) => [...new Set(items)];

/**
 * Guest to account merge: account order first, then local items that are new.
 * Both lists are capped. The theme is only taken from the guest if the account has none set.
 */
export async function mergeGuestPreferences(userId: string, guest: MergePreferencesBody): Promise<Preferences> {
  const current = await getPreferences(userId);
  const bookmarks = unique([...current.bookmarks, ...(guest.bookmarks ?? [])]).slice(0, MAX_BOOKMARKS);
  const recents = unique([...(guest.recents ?? []), ...current.recents]).slice(0, MAX_RECENTS);
  const theme = current.theme === 'system' && guest.theme ? guest.theme : current.theme;
  return replacePreferences(userId, { bookmarks, recents, theme });
}
