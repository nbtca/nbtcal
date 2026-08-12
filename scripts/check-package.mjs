import { spawnSync } from 'node:child_process';
import { mkdtemp, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const temporaryDirectory = await mkdtemp(join(tmpdir(), 'nbtcal-package-'));

function run(command, args, cwd) {
  const result = spawnSync(command, args, {
    cwd,
    env: {
      ...process.env,
      npm_config_audit: 'false',
      npm_config_dry_run: 'false',
      npm_config_fund: 'false',
    },
    stdio: 'inherit',
  });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${command} exited with status ${result.status}`);
}

try {
  run('npm', ['pack', '--pack-destination', temporaryDirectory], root);
  const tarballs = (await readdir(temporaryDirectory)).filter((name) => name.endsWith('.tgz'));
  if (tarballs.length !== 1) throw new Error('npm pack did not produce exactly one tarball');

  await writeFile(
    join(temporaryDirectory, 'package.json'),
    JSON.stringify({
      private: true,
      type: 'module',
    }),
  );
  await writeFile(
    join(temporaryDirectory, 'smoke.mjs'),
    [
      "import { createCalendar } from '@nbtca/nbtcal';",
      "import { campusWeekday, createTimetableSchedule, findAcademicTerm, parseWeekExpression, timetableToIcs } from '@nbtca/nbtcal/timetable';",
      "if (typeof createCalendar !== 'function') throw new TypeError('invalid root export');",
      "if (typeof timetableToIcs !== 'function') throw new TypeError('invalid timetable export');",
      "if (typeof createTimetableSchedule !== 'function' || typeof findAcademicTerm !== 'function') throw new TypeError('invalid schedule exports');",
      "if (campusWeekday(new Date('2026-09-06T16:00:00Z')) !== 1) throw new TypeError('invalid campus weekday');",
      "if (parseWeekExpression('1-2周').join(',') !== '1,2') throw new TypeError('invalid runtime');",
    ].join('\n'),
  );
  await writeFile(
    join(temporaryDirectory, 'consumer.ts'),
    [
      "import type { Calendar } from '@nbtca/nbtcal';",
      "import type { Timetable, TimetableOccurrence, TimetableSchedule, TimetableUntimedCourse } from '@nbtca/nbtcal/timetable';",
      "const course: TimetableUntimedCourse = { sourceId: null, courseName: 'Practice course', teacherNames: [], campus: null, location: null, weeks: [1], kind: 'practice' };",
      "const timetable: Pick<Timetable, 'untimedCourses'> = { untimedCourses: [course] };",
      'void (null as Calendar | null);',
      'void timetable;',
      'void (null as TimetableOccurrence | TimetableSchedule | null);',
    ].join('\n'),
  );

  run(
    'npm',
    ['install', '--ignore-scripts', join(temporaryDirectory, tarballs[0])],
    temporaryDirectory,
  );
  run(
    process.execPath,
    [
      join(root, 'node_modules/typescript/bin/tsc'),
      '--noEmit',
      '--strict',
      '--target',
      'ES2022',
      '--module',
      'NodeNext',
      '--moduleResolution',
      'NodeNext',
      'consumer.ts',
    ],
    temporaryDirectory,
  );
  run(process.execPath, ['smoke.mjs'], temporaryDirectory);
} finally {
  await rm(temporaryDirectory, { recursive: true, force: true });
}
