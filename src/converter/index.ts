import { createEvents, type EventAttributes } from 'ics';
import type { CourseSchedule } from '../types.js';

export class ICSConverter {
  private semesterStartDate: Date;

  constructor(semesterStartDate: Date) {
    this.semesterStartDate = semesterStartDate;
  }

  convert(courses: CourseSchedule[]): Buffer {
    const events: EventAttributes[] = [];

    for (const course of courses) {
      for (const week of course.weeks) {
        const event = this.createEvent(course, week);
        events.push(event);
      }
    }

    const { error, value } = createEvents(events);

    if (error) {
      throw new Error(`Failed to create ICS: ${error.message}`);
    }

    return Buffer.from(value!, 'utf-8');
  }

  private createEvent(course: CourseSchedule, week: number): EventAttributes {
    const date = this.calculateDate(week, course.weekday);
    const [startHour, startMinute] = course.startTime.split(':').map(Number);
    const [endHour, endMinute] = course.endTime.split(':').map(Number);

    const description = course.courseType === 'practice'
      ? `实践教学\n教师: ${course.teacher}`
      : `教师: ${course.teacher}`;

    return {
      title: course.name,
      description,
      location: course.location,
      start: [date.getFullYear(), date.getMonth() + 1, date.getDate(), startHour, startMinute],
      end: [date.getFullYear(), date.getMonth() + 1, date.getDate(), endHour, endMinute],
      status: 'CONFIRMED',
      busyStatus: 'BUSY'
    };
  }

  private calculateDate(week: number, weekday: number): Date {
    const date = new Date(this.semesterStartDate);

    // Calculate days to add
    // Week 1, Monday (weekday 1) = semesterStartDate
    // Week 1, Tuesday (weekday 2) = semesterStartDate + 1
    // Week 2, Monday (weekday 1) = semesterStartDate + 7
    const daysToAdd = (week - 1) * 7 + (weekday - 1);

    date.setDate(date.getDate() + daysToAdd);
    return date;
  }
}
