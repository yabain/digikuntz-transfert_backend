import { Injectable } from '@nestjs/common';

/**
 * Service for handling date and time formatting operations.
 * Provides utilities for converting dates between different formats and languages.
 * Supports both French and English localization with short and long format options.
 */
@Injectable()
export class DateService {
  /** Current language setting for date formatting (defaults to French) */
  currentLang: string;

  constructor() {}

  /**
   * Converts a date string from "YYYY-MM-DD" format to a localized "Ddd, DD MMM YYYY" format.
   *
   * @param {string} dateStr - The input date string in "YYYY-MM-DD" format
   * @param {string} [format='long'] - The format style: 'long' for full names, 'short' for abbreviated names
   * @param {string} [lang='fr'] - The language for localization: 'en' for English, 'fr' for French
   * @returns {string} The formatted date string in "Ddd, DD MMM YYYY" format
   *
   * @example
   * formatDate('2024-01-15', 'long', 'fr') // Returns: "Monday, 15 January 2024"
   * formatDate('2024-01-15', 'short', 'en') // Returns: "Mon, 15 Jan 2024"
   */
  formatDate(dateStr: string, format?: string, lang?: string) {
    // Set default values if not provided
    if (!format) {
      format = 'long';
    }
    if (!lang) {
      lang = 'fr';
    }

    // French abbreviated day and month names (default)
    let days = ['Dim', 'Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam'];
    let months = [
      'Jan',
      'Fév',
      'Mars',
      'Avr',
      'Mai',
      'Juin',
      'Juil',
      'Aoû',
      'Sep',
      'Oct',
      'Nov',
      'Déc',
    ];

    // English abbreviated format
    if (format === 'short' && lang === 'en') {
      days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
      months = [
        'Jan',
        'Feb',
        'Mar',
        'Apr',
        'May',
        'Jun',
        'Jul',
        'Aug',
        'Sep',
        'Oct',
        'Nov',
        'Dec',
      ];
    }

    // French full format
    if (format === 'long' && lang === 'fr') {
      days = [
        'Dimanche',
        'Lundi',
        'Mardi',
        'Mercredi',
        'Jeudi',
        'Vendredi',
        'Samedi',
      ];
      months = [
        'Janvier',
        'Février',
        'Mars',
        'Avril',
        'Mai',
        'Juin',
        'Juillet',
        'Août',
        'Septembre',
        'Octobre',
        'Novembre',
        'Décembre',
      ];
    }

    // English full format
    if (format === 'long' && lang === 'en') {
      days = [
        'Sunday',
        'Monday',
        'Tuesday',
        'Wednesday',
        'Thursday',
        'Friday',
        'Saturday',
      ];
      months = [
        'January',
        'February',
        'March',
        'April',
        'May',
        'June',
        'July',
        'August',
        'September',
        'October',
        'November',
        'December',
      ];
    }

    // Parse the date and extract components
    const date = new Date(dateStr);
    const dayName = days[date.getUTCDay()];
    const day = date.getUTCDate();
    const monthName = months[date.getUTCMonth()];
    const year = date.getUTCFullYear();

    // Format the date with zero-padded day
    if (lang === 'fr')
      return `${dayName}, ${day.toString().padStart(2, '0')} ${monthName} ${year}`;
    else
      return `${dayName}, ${day.toString().padStart(2, '0')} ${monthName} ${year}`;
  }

  /**
   * Extracts and formats the month name from a date string.
   *
   * @param {string} dateStr - The input date string in "YYYY-MM-DD" format
   * @param {string} [lang] - The language for month name: 'en' for English, 'fr' for French
   * @returns {string} The abbreviated month name in the specified language
   *
   * @example
   * monthDate('2024-01-15', 'fr') // Returns: "Jan"
   * monthDate('2024-01-15', 'en') // Returns: "Jan"
   */
  monthDate(dateStr: string, lang?: string): string {
    // Use current language if none specified
    if (!lang) {
      lang = this.currentLang;
    }

    // French abbreviated month names
    let months = [
      'Jan',
      'Fév',
      'Mars',
      'Avr',
      'Mai',
      'Juin',
      'Juil',
      'Aoû',
      'Sep',
      'Oct',
      'Nov',
      'Déc',
    ];

    // English abbreviated month names
    if (lang === 'en') {
      months = [
        'Jan',
        'Feb',
        'Mar',
        'Apr',
        'May',
        'Jun',
        'Jul',
        'Aug',
        'Sep',
        'Oct',
        'Nov',
        'Dec',
      ];
    }

    // Parse date and return month name
    const date = new Date(dateStr);
    const monthName = months[date.getUTCMonth()];

    return `${monthName}`;
  }

  /**
   * Converts a 24-hour time string to a 12-hour English format with AM/PM indicator.
   *
   * @param {string} time - A time string in "HH:mm" format (24-hour)
   * @returns {string} A time string in "hh:mm AM/PM" format (12-hour)
   *
   * @example
   * convertTimeFormat('14:30') // Returns: "02:30 PM"
   * convertTimeFormat('09:15') // Returns: "09:15 AM"
   * convertTimeFormat('00:00') // Returns: "12:00 AM"
   */
  convertTimeFormat(time: string): string {
    // Split the input time into hours and minutes and convert to numbers
    const [hours, minutes] = time.split(':').map(Number);

    // Determine AM or PM based on hour value
    const period = hours >= 12 ? 'PM' : 'AM';

    // Convert hours to 12-hour format (0 becomes 12 for midnight)
    const hoursIn12Format = hours % 12 || 12;

    // Return formatted time with zero-padded hours and minutes
    return `${hoursIn12Format.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')} ${period}`;
  }

  /**
   * Formats a date and time string into ISO 8601 format with timezone.
   * Adds default seconds and timezone offset to create a complete ISO timestamp.
   *
   * @param {string} dateStr - Date string in "YYYY-MM-DD" format
   * @param {string} timeStr - Time string in "HH:mm" format
   * @returns {string} ISO 8601 formatted datetime string with timezone
   *
   * @example
   * formatToISO('2024-01-15', '14:30') // Returns: "2024-01-15T14:30:00+01:00"
   */
  formatToISO(dateStr, timeStr) {
    // Add default seconds to the time string
    const timeWithSeconds = `${timeStr}:00`;

    // Add timezone offset (Central European Time)
    const timezoneOffset = '+01:00';

    // Combine date, time, and timezone into ISO format
    return `${dateStr}T${timeWithSeconds}${timezoneOffset}`;
  }

  /**
   * Formats a datetime string to display only the time component.
   * Returns 24-hour format for French and 12-hour format for English.
   *
   * @param {string} dateIn - Input datetime string
   * @param {string} [lang='fr'] - Language for time format: 'fr' for 24-hour, 'en' for 12-hour
   * @returns {string} Formatted time string
   *
   * @example
   * formatTime('2024-01-15T14:30:00', 'fr') // Returns: "14:30"
   * formatTime('2024-01-15T14:30:00', 'en') // Returns: "02:30 PM"
   */
  formatTime(dateIn: string, lang?: string): string {
    // Default to French if no language specified
    if (!lang) {
      lang = 'fr';
    }

    // Parse the input datetime
    const date = new Date(dateIn);

    // Extract hours and minutes with zero-padding
    const hours = date.getHours().toString().padStart(2, '0');
    const minutes = date.getMinutes().toString().padStart(2, '0');

    // Create 24-hour time format
    const time = `${hours}:${minutes}`;

    // Return appropriate format based on language
    if (lang == 'fr') {
      return time; // 24-hour format for French
    } else {
      return this.convertTimeFormat(time); // 12-hour format for English
    }
  }

  /**
   * Converts a date string to an array format suitable for iCalendar (ICS) files.
   * Returns an array of [year, month, day, hour, minute] for ICS date formatting.
   *
   * @param {string} dateString - Input date string
   * @returns {[number, number, number, number, number]} Array of [year, month, day, hour, minute]
   *
   * @example
   * convertToIcsDate('2024-01-15T14:30:00') // Returns: [2024, 1, 15, 14, 30]
   */
  convertToIcsDate(
    dateString: string,
  ): [number, number, number, number, number] {
    const d = new Date(dateString);
    return [
      d.getFullYear(),
      d.getMonth() + 1, // Month is 0-indexed in JavaScript, so add 1
      d.getDate(),
      d.getHours(),
      d.getMinutes(),
    ];
  }
}
