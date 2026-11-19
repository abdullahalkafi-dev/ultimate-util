export interface CheckResult {
  score: 0 | 1 | 2 | 3 | 4;
  guessesLog2: number;
  warning: string | null;
  suggestions: string[];
  common: boolean;
  truncated: boolean;
  times: { label: string; display: string }[];
}

export const MAX_CHECK_LENGTH = 100;

type Checker = (pw: string) => import('@zxcvbn-ts/core').ZxcvbnResult;
let checker: Promise<Checker> | null = null;

/** Loads zxcvbn-ts and its local dictionaries once, only when "Check mine" is used. */
function loadChecker(): Promise<Checker> {
  checker ??= Promise.all([
    import('@zxcvbn-ts/core'),
    import('@zxcvbn-ts/language-common'),
    import('@zxcvbn-ts/language-en'),
  ]).then(([core, common, en]) => {
    const factory = new core.ZxcvbnFactory({
      dictionary: { ...common.dictionary, ...en.dictionary },
      graphs: common.adjacencyGraphs,
      translations: en.translations,
    });
    return (pw: string) => factory.check(pw);
  });
  return checker;
}

export async function checkPassword(raw: string): Promise<CheckResult> {
  const truncated = raw.length > MAX_CHECK_LENGTH;
  const pw = truncated ? raw.slice(0, MAX_CHECK_LENGTH) : raw;
  const r = (await loadChecker())(pw);
  const first = r.sequence[0] as { dictionaryName?: string; token?: string } | undefined;
  const common = r.sequence.length === 1 && first?.dictionaryName === 'passwords-common' && first.token === pw;
  const t = r.crackTimes;
  return {
    score: r.score,
    guessesLog2: Math.log2(Math.max(1, r.guesses)),
    warning: r.feedback.warning,
    suggestions: r.feedback.suggestions,
    common,
    truncated,
    times: [
      { label: 'Online, throttled (100 per hour)', display: t.onlineThrottlingXPerHour.display },
      { label: 'Online, no throttling (10 per second)', display: t.onlineNoThrottlingXPerSecond.display },
      { label: 'Offline, slow hash (10,000 per second)', display: t.offlineSlowHashingXPerSecond.display },
      { label: 'Offline, fast hash (10 billion per second)', display: t.offlineFastHashingXPerSecond.display },
    ],
  };
}
