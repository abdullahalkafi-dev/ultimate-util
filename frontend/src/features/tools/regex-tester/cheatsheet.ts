export interface CheatEntry {
  insert: string;
  label: string;
  note?: string;
}

export interface CheatGroup {
  title: string;
  entries: CheatEntry[];
}

export const CHEATSHEET: CheatGroup[] = [
  {
    title: 'Characters',
    entries: [
      { insert: '.', label: 'Any character except a line break' },
      { insert: '\\d', label: 'Digit' },
      { insert: '\\D', label: 'Not a digit' },
      { insert: '\\w', label: 'Word character' },
      { insert: '\\W', label: 'Not a word character' },
      { insert: '\\s', label: 'Whitespace' },
      { insert: '\\S', label: 'Not whitespace' },
      { insert: '[abc]', label: 'Any of a, b or c' },
      { insert: '[^abc]', label: 'Anything but a, b or c' },
      { insert: '[a-z]', label: 'A character in a range' },
      { insert: '\\n', label: 'Line feed' },
      { insert: '\\t', label: 'Tab' },
    ],
  },
  {
    title: 'Anchors',
    entries: [
      { insert: '^', label: 'Start of text (or line with m)' },
      { insert: '$', label: 'End of text (or line with m)' },
      { insert: '\\b', label: 'Word boundary' },
      { insert: '\\B', label: 'Not a word boundary' },
    ],
  },
  {
    title: 'Groups',
    entries: [
      { insert: '()', label: 'Capture group' },
      { insert: '(?:)', label: 'Non-capturing group' },
      { insert: '(?<name>)', label: 'Named capture group' },
      { insert: '\\1', label: 'Backreference to group 1' },
      { insert: '\\k<name>', label: 'Backreference by name' },
      { insert: '|', label: 'Or' },
    ],
  },
  {
    title: 'Quantifiers',
    entries: [
      { insert: '*', label: 'Zero or more' },
      { insert: '+', label: 'One or more' },
      { insert: '?', label: 'Zero or one' },
      { insert: '{3}', label: 'Exactly 3' },
      { insert: '{2,5}', label: 'Between 2 and 5' },
      { insert: '{2,}', label: '2 or more' },
      { insert: '*?', label: 'Lazy: as few as possible' },
    ],
  },
  {
    title: 'Lookaround',
    entries: [
      { insert: '(?=)', label: 'Positive lookahead' },
      { insert: '(?!)', label: 'Negative lookahead' },
      { insert: '(?<=)', label: 'Positive lookbehind', note: 'Not in Safari before 16.4' },
      { insert: '(?<!)', label: 'Negative lookbehind', note: 'Not in Safari before 16.4' },
    ],
  },
  {
    title: 'Unicode (needs the u or v flag)',
    entries: [
      { insert: '\\p{L}', label: 'Any letter' },
      { insert: '\\p{Lu}', label: 'Uppercase letter' },
      { insert: '\\p{N}', label: 'Any number' },
      { insert: '\\p{Emoji}', label: 'Emoji' },
      { insert: '\\p{Script=Greek}', label: 'A script' },
      { insert: '\\u{1F600}', label: 'Code point' },
    ],
  },
  {
    title: 'Flags',
    entries: [
      { insert: 'g', label: 'Global: find every match' },
      { insert: 'i', label: 'Ignore case' },
      { insert: 'm', label: '^ and $ match at line breaks' },
      { insert: 's', label: '. also matches line breaks' },
      { insert: 'u', label: 'Unicode mode' },
      { insert: 'v', label: 'Unicode sets (newer browsers)' },
      { insert: 'y', label: 'Sticky: match only at lastIndex' },
      { insert: 'd', label: 'Report group start and end indices' },
    ],
  },
];

export const NOTES = [
  'Named groups are (?<name>...) in JavaScript, not (?P<name>...).',
  'Not available: possessive quantifiers (a++), atomic groups (?>...), \\A \\Z, inline flags (?i), recursion, \\X.',
  'JavaScript allows variable-width lookbehind, which PCRE and Python reject, so a pattern may not port back.',
];
