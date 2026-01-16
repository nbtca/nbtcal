import type { AxiosInstance } from 'axios';
import type { CourseSchedule, SemesterSelection } from '../types.js';

interface ScheduleAPIResponse {
  kbList: any[];
  sjkList: any[];
  xsxx: {
    XNM: string;
    XNMC: string;
    XQM: string;
    XQMMC: string;
  };
}

export class ScheduleScraper {
  constructor(private client: AxiosInstance) {}

  async extractSchedule(semester: SemesterSelection): Promise<CourseSchedule[]> {
    const apiUrl = 'https://jwxt-443.webvpn.nbt.edu.cn/jwglxt/kbcx/xskbcx_cxXsgrkb.html';
    const schedulePageUrl = 'https://jwxt-443.webvpn.nbt.edu.cn/jwglxt/kbcx/xskbcx_cxXskbcxIndex.html?gnmkdm=N2151&layout=default';

    try {
      const response = await this.client.post(apiUrl, new URLSearchParams({
        xnm: semester.academicYear,
        xqm: semester.semester
      }).toString(), {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'X-Requested-With': 'XMLHttpRequest',
          'Referer': schedulePageUrl
        }
      });

      if (response.status !== 200) {
        throw new Error(`Failed to fetch schedule data (Status: ${response.status}). The API may have changed or session expired.`);
      }

      if (!response.data) {
        throw new Error('Empty response from schedule API');
      }

    const data: ScheduleAPIResponse = response.data;
    const courses: CourseSchedule[] = [];

    // Parse regular courses (kbList)
    if (data.kbList && Array.isArray(data.kbList)) {
      for (const item of data.kbList) {
        courses.push(...this.parseCourse(item));
      }
    }

      // Parse practice courses (sjkList)
      if (data.sjkList && Array.isArray(data.sjkList)) {
        for (const item of data.sjkList) {
          courses.push(...this.parsePracticeCourse(item));
        }
      }

      return courses;
    } catch (error: any) {
      if (error.message.includes('Failed to')) {
        throw error;
      }
      throw new Error(`Error fetching schedule: ${error.message}`);
    }
  }

  private parseCourse(item: any): CourseSchedule[] {
    const name = item.kcmc || '';  // 课程名称
    const teacher = item.xm || '';  // 教师
    const location = item.cdmc || '';  // 教室
    const weekday = parseInt(item.xqj) || 0;  // 星期几
    const weeks = this.parseWeeks(item.zcd || '');  // 周次
    const timeSlots = this.parseTimeSlots(item.jcs || item.jc || '');  // 节次

    if (!name || !weekday || weeks.length === 0 || !timeSlots) {
      return [];
    }

    return [{
      name,
      teacher,
      location,
      weekday,
      startTime: timeSlots.startTime,
      endTime: timeSlots.endTime,
      weeks,
      courseType: 'regular'
    }];
  }

  private parsePracticeCourse(item: any): CourseSchedule[] {
    const name = item.kcmc || '';
    const teacher = item.jsxm || '';
    const weeks = this.parseWeeks(item.qsjsz || '');

    if (!name || weeks.length === 0) {
      return [];
    }

    // Practice courses are usually all-day events
    // We'll create events for Monday through Friday of each week
    const courses: CourseSchedule[] = [];

    for (let weekday = 1; weekday <= 5; weekday++) {
      courses.push({
        name: `${name} (实践)`,
        teacher,
        location: '无',
        weekday,
        startTime: '08:00',
        endTime: '17:00',
        weeks,
        courseType: 'practice'
      });
    }

    return courses;
  }

  private parseWeeks(weekStr: string): number[] {
    // Examples: "1-16周", "9-16周", "1-8周", "14-16周", "16周"
    const weeks: number[] = [];

    if (!weekStr) return weeks;

    // Remove "周" character
    weekStr = weekStr.replace(/周/g, '');

    // Handle single week
    if (!weekStr.includes('-') && !weekStr.includes(',')) {
      const week = parseInt(weekStr);
      if (!isNaN(week)) {
        weeks.push(week);
      }
      return weeks;
    }

    // Handle ranges and lists
    const parts = weekStr.split(',');

    for (const part of parts) {
      if (part.includes('-')) {
        const [start, end] = part.split('-').map(s => parseInt(s.trim()));
        if (!isNaN(start) && !isNaN(end)) {
          for (let i = start; i <= end; i++) {
            weeks.push(i);
          }
        }
      } else {
        const week = parseInt(part.trim());
        if (!isNaN(week)) {
          weeks.push(week);
        }
      }
    }

    return weeks;
  }

  private parseTimeSlots(slotStr: string): { startTime: string; endTime: string } | null {
    // Examples: "3-4节", "3-4", "1-2"
    if (!slotStr) return null;

    // Remove "节" character
    slotStr = slotStr.replace(/节/g, '');

    const match = slotStr.match(/(\d+)-(\d+)/);
    if (!match) return null;

    const startSlot = parseInt(match[1]);
    const endSlot = parseInt(match[2]);

    return {
      startTime: this.getTimeFromSlot(startSlot),
      endTime: this.getTimeFromSlot(endSlot + 1)
    };
  }

  private getTimeFromSlot(slot: number): string {
    // Standard class time slots for NBT
    const slots: Record<number, string> = {
      1: '08:00',
      2: '08:50',
      3: '09:50',
      4: '10:40',
      5: '11:30',
      6: '13:30',
      7: '14:20',
      8: '15:20',
      9: '16:10',
      10: '17:00',
      11: '18:30',
      12: '19:20',
      13: '20:10',
      14: '21:00'
    };

    return slots[slot] || '08:00';
  }

  async getCurrentSemester(): Promise<SemesterSelection> {
    // Get current semester from schedule page
    const schedulePageUrl = 'https://jwxt-443.webvpn.nbt.edu.cn/jwglxt/kbcx/xskbcx_cxXskbcxIndex.html?gnmkdm=N2151&layout=default';
    const response = await this.client.get(schedulePageUrl);

    const cheerio = await import('cheerio');
    const $ = cheerio.load(response.data);

    const selectedYear = $('#xnm option[selected]').attr('value') || '2025';
    const selectedSemester = $('#xqm option[selected]').attr('value') || '12';

    return {
      academicYear: selectedYear,
      semester: selectedSemester
    };
  }
}
