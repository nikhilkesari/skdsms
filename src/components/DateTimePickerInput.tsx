/**
 * Sked SMS — Date & Time Picker Controls
 * Target: src/components/DateTimePickerInput.tsx
 *
 * Provides Date and Time selection dialogs with pure React Native modals.
 * Features an inline validation banner blocking past dates and times with a 30-second lead buffer.
 * Displays formatted date & time: "MMM DD, YYYY at HH:mm".
 */

import React, { useState, useEffect } from 'react';
import {
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  Modal,
  ScrollView,
  StyleProp,
  ViewStyle,
} from 'react-native';
import { validateScheduledTime } from '../utils/validation';

export interface DateTimePickerInputProps {
  selectedDate?: Date;
  value?: Date;
  onChangeDate?: (newDate: Date) => void;
  onChange?: (newDate: Date) => void;
  error?: string;
  disabled?: boolean;
  now?: Date;
  bufferMs?: number;
  leadBufferMs?: number;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

const MONTHS_SHORT = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
];

export function formatScheduleDateTime(d: Date): string {
  if (!(d instanceof Date) || isNaN(d.getTime())) return 'Invalid Date';
  const month = MONTHS_SHORT[d.getMonth()];
  const day = String(d.getDate()).padStart(2, '0');
  const year = d.getFullYear();
  const hours = String(d.getHours()).padStart(2, '0');
  const minutes = String(d.getMinutes()).padStart(2, '0');
  return `${month} ${day}, ${year} at ${hours}:${minutes}`;
}

export function formatScheduleDate(d: Date): string {
  if (!(d instanceof Date) || isNaN(d.getTime())) return 'Invalid Date';
  const month = MONTHS_SHORT[d.getMonth()];
  const day = String(d.getDate()).padStart(2, '0');
  const year = d.getFullYear();
  return `${month} ${day}, ${year}`;
}

export function formatScheduleTime(d: Date): string {
  if (!(d instanceof Date) || isNaN(d.getTime())) return 'Invalid Time';
  const hours = String(d.getHours()).padStart(2, '0');
  const minutes = String(d.getMinutes()).padStart(2, '0');
  return `${hours}:${minutes}`;
}

export const DateTimePickerInput: React.FC<DateTimePickerInputProps> = ({
  selectedDate,
  value,
  onChangeDate,
  onChange,
  error,
  disabled = false,
  now,
  bufferMs = 30000,
  leadBufferMs,
  style,
  testID = 'date-time-picker-container',
}) => {
  const effectiveBufferMs = leadBufferMs ?? bufferMs;
  const effectiveNow = now || new Date();
  const currentDate = selectedDate || value || new Date(effectiveNow.getTime() + 3600000);

  const handleDateChange = (newDate: Date) => {
    if (onChangeDate) onChangeDate(newDate);
    if (onChange) onChange(newDate);
  };

  const [isDatePickerOpen, setIsDatePickerOpen] = useState<boolean>(false);
  const [isTimePickerOpen, setIsTimePickerOpen] = useState<boolean>(false);

  // Temporary staging date for modal dialogs
  const [tempDate, setTempDate] = useState<Date>(() => new Date(currentDate.getTime()));

  useEffect(() => {
    if (currentDate instanceof Date && !isNaN(currentDate.getTime())) {
      setTempDate(new Date(currentDate.getTime()));
    }
  }, [currentDate]);

  // Validation against past date with 30s lead buffer
  const timeValidation = validateScheduledTime(currentDate, effectiveNow, effectiveBufferMs);

  const openDatePicker = () => {
    if (disabled) return;
    setTempDate(new Date(currentDate.getTime()));
    setIsDatePickerOpen(true);
  };

  const openTimePicker = () => {
    if (disabled) return;
    setTempDate(new Date(currentDate.getTime()));
    setIsTimePickerOpen(true);
  };

  const confirmDate = () => {
    handleDateChange(new Date(tempDate.getTime()));
    setIsDatePickerOpen(false);
  };

  const confirmTime = () => {
    handleDateChange(new Date(tempDate.getTime()));
    setIsTimePickerOpen(false);
  };

  const adjustDate = (field: 'year' | 'month' | 'day', amount: number) => {
    const updated = new Date(tempDate.getTime());
    if (field === 'year') {
      updated.setFullYear(updated.getFullYear() + amount);
    } else if (field === 'month') {
      updated.setMonth(updated.getMonth() + amount);
    } else if (field === 'day') {
      updated.setDate(updated.getDate() + amount);
    }
    setTempDate(updated);
  };

  const adjustTime = (field: 'hour' | 'minute', amount: number) => {
    const updated = new Date(tempDate.getTime());
    if (field === 'hour') {
      updated.setHours(updated.getHours() + amount);
    } else if (field === 'minute') {
      updated.setMinutes(updated.getMinutes() + amount);
    }
    setTempDate(updated);
  };

  const applyDatePreset = (daysFromNow: number) => {
    const base = new Date(effectiveNow.getTime());
    const updated = new Date(tempDate.getTime());
    updated.setFullYear(base.getFullYear());
    updated.setMonth(base.getMonth());
    updated.setDate(base.getDate() + daysFromNow);
    setTempDate(updated);
  };

  const applyTimePreset = (minutesToAdd: number, fixedHour?: number) => {
    const updated = new Date(tempDate.getTime());
    if (fixedHour !== undefined) {
      updated.setHours(fixedHour, 0, 0, 0);
    } else {
      updated.setTime(effectiveNow.getTime() + minutesToAdd * 60 * 1000);
    }
    setTempDate(updated);
  };

  return (
    <View style={[styles.container, style]} testID={testID}>
      <Text style={styles.sectionTitle}>Schedule Date & Time *</Text>

      {/* Formatted Display Summary Card */}
      <View style={styles.summaryCard}>
        <Text style={styles.summaryLabel}>Delivery Time:</Text>
        <Text style={styles.summaryValue} testID="datetime-display-text">
          {formatScheduleDateTime(currentDate)}
        </Text>
      </View>

      {/* Date & Time Picker Trigger Buttons */}
      <View style={styles.pickerButtonsRow}>
        <TouchableOpacity
          testID="date-picker-trigger"
          accessibilityRole="button"
          accessibilityLabel={`Date: ${formatScheduleDate(currentDate)}. Tap to change date.`}
          style={[styles.pickerButton, disabled && styles.pickerButtonDisabled]}
          onPress={openDatePicker}
          disabled={disabled}
        >
          <Text style={styles.pickerButtonIcon}>📅</Text>
          <View>
            <Text style={styles.pickerButtonLabel}>Select Date</Text>
            <Text style={styles.pickerButtonValue} testID="selected-date-display">
              {formatScheduleDate(currentDate)}
            </Text>
          </View>
        </TouchableOpacity>

        <TouchableOpacity
          testID="time-picker-trigger"
          accessibilityRole="button"
          accessibilityLabel={`Time: ${formatScheduleTime(currentDate)}. Tap to change time.`}
          style={[styles.pickerButton, disabled && styles.pickerButtonDisabled]}
          onPress={openTimePicker}
          disabled={disabled}
        >
          <Text style={styles.pickerButtonIcon}>⏰</Text>
          <View>
            <Text style={styles.pickerButtonLabel}>Select Time</Text>
            <Text style={styles.pickerButtonValue} testID="selected-time-display">
              {formatScheduleTime(currentDate)}
            </Text>
          </View>
        </TouchableOpacity>
      </View>

      {/* Inline Validation Banner (Blocks past dates/times with 30s lead buffer) */}
      {!timeValidation.isValid ? (
        <View style={styles.errorBanner} testID="datetime-validation-banner">
          <Text style={styles.errorBannerText} testID="datetime-validation-error-text">
            ⚠ {timeValidation.error || 'Scheduled time must be in the future (minimum 30 seconds from now).'}
          </Text>
        </View>
      ) : (
        <View style={styles.validBanner} testID="datetime-validation-banner-valid">
          <Text style={styles.validBannerText} testID="datetime-validation-valid-text">
            ✓ Scheduled for future delivery ({formatScheduleDateTime(currentDate)})
          </Text>
        </View>
      )}

      {Boolean(error) && (
        <Text style={styles.customErrorText} testID="datetime-custom-error">
          {error}
        </Text>
      )}

      {/* Date Picker Modal */}
      <Modal
        testID="date-picker-modal"
        visible={isDatePickerOpen}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setIsDatePickerOpen(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.dialogContainer}>
            <Text style={styles.dialogTitle}>Select Date</Text>

            {/* Presets */}
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.presetsRow}>
              <TouchableOpacity
                testID="date-preset-today"
                style={styles.presetChip}
                onPress={() => applyDatePreset(0)}
              >
                <Text style={styles.presetChipText}>Today</Text>
              </TouchableOpacity>
              <TouchableOpacity
                testID="date-preset-tomorrow"
                style={styles.presetChip}
                onPress={() => applyDatePreset(1)}
              >
                <Text style={styles.presetChipText}>Tomorrow</Text>
              </TouchableOpacity>
              <TouchableOpacity
                testID="date-preset-2days"
                style={styles.presetChip}
                onPress={() => applyDatePreset(2)}
              >
                <Text style={styles.presetChipText}>In 2 Days</Text>
              </TouchableOpacity>
              <TouchableOpacity
                testID="date-preset-nextweek"
                style={styles.presetChip}
                onPress={() => applyDatePreset(7)}
              >
                <Text style={styles.presetChipText}>Next Week</Text>
              </TouchableOpacity>
            </ScrollView>

            {/* Stepper Controls */}
            <View style={styles.stepperContainer}>
              {/* Year */}
              <View style={styles.stepperColumn}>
                <Text style={styles.stepperLabel}>Year</Text>
                <View style={styles.stepperBox}>
                  <TouchableOpacity
                    testID="date-year-prev"
                    style={styles.stepperButton}
                    onPress={() => adjustDate('year', -1)}
                  >
                    <Text style={styles.stepperButtonText}>-</Text>
                  </TouchableOpacity>
                  <Text style={styles.stepperValueText} testID="date-year-text">
                    {tempDate.getFullYear()}
                  </Text>
                  <TouchableOpacity
                    testID="date-year-next"
                    style={styles.stepperButton}
                    onPress={() => adjustDate('year', 1)}
                  >
                    <Text style={styles.stepperButtonText}>+</Text>
                  </TouchableOpacity>
                </View>
              </View>

              {/* Month */}
              <View style={styles.stepperColumn}>
                <Text style={styles.stepperLabel}>Month</Text>
                <View style={styles.stepperBox}>
                  <TouchableOpacity
                    testID="date-month-prev"
                    style={styles.stepperButton}
                    onPress={() => adjustDate('month', -1)}
                  >
                    <Text style={styles.stepperButtonText}>-</Text>
                  </TouchableOpacity>
                  <Text style={styles.stepperValueText} testID="date-month-text">
                    {MONTHS_SHORT[tempDate.getMonth()]}
                  </Text>
                  <TouchableOpacity
                    testID="date-month-next"
                    style={styles.stepperButton}
                    onPress={() => adjustDate('month', 1)}
                  >
                    <Text style={styles.stepperButtonText}>+</Text>
                  </TouchableOpacity>
                </View>
              </View>

              {/* Day */}
              <View style={styles.stepperColumn}>
                <Text style={styles.stepperLabel}>Day</Text>
                <View style={styles.stepperBox}>
                  <TouchableOpacity
                    testID="date-day-prev"
                    style={styles.stepperButton}
                    onPress={() => adjustDate('day', -1)}
                  >
                    <Text style={styles.stepperButtonText}>-</Text>
                  </TouchableOpacity>
                  <Text style={styles.stepperValueText} testID="date-day-text">
                    {String(tempDate.getDate()).padStart(2, '0')}
                  </Text>
                  <TouchableOpacity
                    testID="date-day-next"
                    style={styles.stepperButton}
                    onPress={() => adjustDate('day', 1)}
                  >
                    <Text style={styles.stepperButtonText}>+</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </View>

            {/* Dialog Action Buttons */}
            <View style={styles.dialogActionsRow}>
              <TouchableOpacity
                testID="cancel-date-button"
                style={styles.dialogCancelButton}
                onPress={() => setIsDatePickerOpen(false)}
              >
                <Text style={styles.dialogCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                testID="confirm-date-button"
                style={styles.dialogConfirmButton}
                onPress={confirmDate}
              >
                <Text style={styles.dialogConfirmText}>Confirm Date</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Time Picker Modal */}
      <Modal
        testID="time-picker-modal"
        visible={isTimePickerOpen}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setIsTimePickerOpen(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.dialogContainer}>
            <Text style={styles.dialogTitle}>Select Time</Text>

            {/* Presets */}
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.presetsRow}>
              <TouchableOpacity
                testID="time-preset-15m"
                style={styles.presetChip}
                onPress={() => applyTimePreset(15)}
              >
                <Text style={styles.presetChipText}>+15m</Text>
              </TouchableOpacity>
              <TouchableOpacity
                testID="time-preset-1h"
                style={styles.presetChip}
                onPress={() => applyTimePreset(60)}
              >
                <Text style={styles.presetChipText}>+1 Hour</Text>
              </TouchableOpacity>
              <TouchableOpacity
                testID="time-preset-morning"
                style={styles.presetChip}
                onPress={() => applyTimePreset(0, 9)}
              >
                <Text style={styles.presetChipText}>09:00 AM</Text>
              </TouchableOpacity>
              <TouchableOpacity
                testID="time-preset-evening"
                style={styles.presetChip}
                onPress={() => applyTimePreset(0, 18)}
              >
                <Text style={styles.presetChipText}>06:00 PM</Text>
              </TouchableOpacity>
            </ScrollView>

            {/* Stepper Controls */}
            <View style={styles.stepperContainer}>
              {/* Hours */}
              <View style={styles.stepperColumn}>
                <Text style={styles.stepperLabel}>Hour (24h)</Text>
                <View style={styles.stepperBox}>
                  <TouchableOpacity
                    testID="time-hour-prev"
                    style={styles.stepperButton}
                    onPress={() => adjustTime('hour', -1)}
                  >
                    <Text style={styles.stepperButtonText}>-</Text>
                  </TouchableOpacity>
                  <Text style={styles.stepperValueText} testID="time-hour-text">
                    {String(tempDate.getHours()).padStart(2, '0')}
                  </Text>
                  <TouchableOpacity
                    testID="time-hour-next"
                    style={styles.stepperButton}
                    onPress={() => adjustTime('hour', 1)}
                  >
                    <Text style={styles.stepperButtonText}>+</Text>
                  </TouchableOpacity>
                </View>
              </View>

              {/* Minutes */}
              <View style={styles.stepperColumn}>
                <Text style={styles.stepperLabel}>Minute</Text>
                <View style={styles.stepperBox}>
                  <TouchableOpacity
                    testID="time-minute-prev"
                    style={styles.stepperButton}
                    onPress={() => adjustTime('minute', -5)}
                  >
                    <Text style={styles.stepperButtonText}>-5</Text>
                  </TouchableOpacity>
                  <Text style={styles.stepperValueText} testID="time-minute-text">
                    {String(tempDate.getMinutes()).padStart(2, '0')}
                  </Text>
                  <TouchableOpacity
                    testID="time-minute-next"
                    style={styles.stepperButton}
                    onPress={() => adjustTime('minute', 5)}
                  >
                    <Text style={styles.stepperButtonText}>+5</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </View>

            {/* Dialog Action Buttons */}
            <View style={styles.dialogActionsRow}>
              <TouchableOpacity
                testID="cancel-time-button"
                style={styles.dialogCancelButton}
                onPress={() => setIsTimePickerOpen(false)}
              >
                <Text style={styles.dialogCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                testID="confirm-time-button"
                style={styles.dialogConfirmButton}
                onPress={confirmTime}
              >
                <Text style={styles.dialogConfirmText}>Confirm Time</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    marginVertical: 8,
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#212121',
    marginBottom: 8,
  },
  summaryCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F5F5F5',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
    marginBottom: 8,
  },
  summaryLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#616161',
    marginRight: 6,
  },
  summaryValue: {
    fontSize: 14,
    fontWeight: '700',
    color: '#0D9488',
  },
  pickerButtonsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  pickerButton: {
    flex: 0.48,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FAFAFA',
    borderWidth: 1,
    borderColor: '#CFD8DC',
    borderRadius: 8,
    padding: 10,
  },
  pickerButtonDisabled: {
    backgroundColor: '#EEEEEE',
    borderColor: '#E0E0E0',
  },
  pickerButtonIcon: {
    fontSize: 22,
    marginRight: 8,
  },
  pickerButtonLabel: {
    fontSize: 11,
    color: '#757575',
    fontWeight: '500',
  },
  pickerButtonValue: {
    fontSize: 14,
    fontWeight: '700',
    color: '#212121',
    marginTop: 2,
  },
  errorBanner: {
    backgroundColor: '#FFEBEE',
    borderColor: '#EF9A9A',
    borderWidth: 1,
    borderRadius: 6,
    padding: 8,
    marginTop: 4,
  },
  errorBannerText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#C62828',
  },
  validBanner: {
    backgroundColor: '#E8F5E9',
    borderColor: '#A5D6A7',
    borderWidth: 1,
    borderRadius: 6,
    padding: 8,
    marginTop: 4,
  },
  validBannerText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#2E7D32',
  },
  customErrorText: {
    fontSize: 12,
    color: '#D32F2F',
    marginTop: 4,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  dialogContainer: {
    width: '100%',
    maxWidth: 380,
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 20,
    elevation: 8,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
  },
  dialogTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#212121',
    marginBottom: 12,
    textAlign: 'center',
  },
  presetsRow: {
    flexDirection: 'row',
    marginBottom: 16,
  },
  presetChip: {
    backgroundColor: '#E0F2F1',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    marginRight: 8,
  },
  presetChipText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#0F766E',
  },
  stepperContainer: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginBottom: 20,
  },
  stepperColumn: {
    alignItems: 'center',
  },
  stepperLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#757575',
    marginBottom: 6,
  },
  stepperBox: {
    alignItems: 'center',
    backgroundColor: '#F5F5F5',
    borderRadius: 8,
    padding: 4,
  },
  stepperButton: {
    width: 38,
    height: 32,
    backgroundColor: '#FFFFFF',
    borderRadius: 4,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#CFD8DC',
  },
  stepperButtonText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#0D9488',
  },
  stepperValueText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#212121',
    marginVertical: 6,
    minWidth: 44,
    textAlign: 'center',
  },
  dialogActionsRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    marginTop: 8,
  },
  dialogCancelButton: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    marginRight: 8,
  },
  dialogCancelText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#757575',
  },
  dialogConfirmButton: {
    backgroundColor: '#0D9488',
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 8,
  },
  dialogConfirmText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#FFFFFF',
  },
});

export default DateTimePickerInput;
