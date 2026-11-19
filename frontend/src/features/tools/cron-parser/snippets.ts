import type { Dialect } from './parse';
import { dowToNames } from './describe';

export const crontabLine = (expr: string) => `${expr} /path/to/command`;

export function kubernetesYaml(expr: string, timeZone: string): string {
  return [
    'apiVersion: batch/v1',
    'kind: CronJob',
    'metadata:',
    '  name: scheduled-job',
    'spec:',
    `  schedule: "${expr}"`,
    `  timeZone: "${timeZone}"`,
    '  concurrencyPolicy: Forbid',
    '  jobTemplate:',
    '    spec:',
    '      template:',
    '        spec:',
    '          restartPolicy: OnFailure',
    '          containers:',
    '            - name: job',
    '              image: busybox:1.36',
    '              command: ["/bin/sh", "-c", "date"]',
    '',
  ].join('\n');
}

/**
 * Unix 5-field to EventBridge `cron(min hour dom month dow year)`.
 * EventBridge cannot express "dom OR dow" or "dom AND dow", so both restricted returns null.
 */
export function toEventBridge(fields: string[], dialect: Dialect): string | null {
  if (dialect !== 'unix' && dialect !== 'k8s') return null;
  const [min, hour, dom, month, dow] = fields;
  if (fields.length !== 5 || !min || !hour || !dom || !month || !dow) return null;
  const domAny = dom === '*' || dom === '?';
  const dowAny = dow === '*' || dow === '?';
  if (!domAny && !dowAny) return null;
  // Both wildcards: keep * in day-of-month and put the ? in day-of-week.
  const domOut = domAny ? (dowAny ? '*' : '?') : dom;
  const dowOut = dowAny ? '?' : dowToNames(dow, dialect);
  return `cron(${min} ${hour} ${domOut} ${month} ${dowOut} *)`;
}
