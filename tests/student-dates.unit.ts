import assert from 'node:assert/strict';
import { groupStudentDates, studentDateKey, studentMonths } from '../src/lib/student-dates';

assert.equal(studentDateKey('2026-11-01T03:00:00Z'), '2026-10-31');
assert.equal(studentDateKey('invalid'), 'sem-data');
const values = ['2026-11-12T16:00:00Z', undefined, '2026-10-31T20:00:00Z', '2026-11-11T16:00:00Z'];
const recent = groupStudentDates(values, value => value, false, new Date('2026-11-12T20:00:00Z'));
assert.deepEqual(recent.map(group => group.key), ['2026-11-12', '2026-11-11', '2026-10-31', 'sem-data']);
assert.match(recent[0].title, /^Hoje/);
assert.match(recent[1].title, /^Ontem/);
assert.deepEqual(groupStudentDates(values, value => value, true).map(group => group.key), ['2026-10-31', '2026-11-11', '2026-11-12', 'sem-data']);
assert.deepEqual(studentMonths(values).map(month => month.value), ['2026-11', '2026-10']);
console.log('Student dates: timezone, grouping, ordering and months passed.');
