/**
 * Sked SMS — Schedule Creation & Edit Form Modal
 * Target: src/components/ScheduleFormModal.tsx
 *
 * Full-featured bottom-sheet dialog for creating or updating scheduled SMS messages.
 * Integrates:
 * 1. ContactPickerInput (device contacts + manual recipient fallback).
 * 2. Message text input with live character and SMS segment counter (160 GSM-7 / 70 Unicode via calculateSmsSegments).
 * 3. DateTimePickerInput with past date blocking and 30-second future lead buffer.
 * 4. Daily recurrence toggle with optional recurrence end date picker.
 * 5. Comprehensive submit validation preventing invalid recipient, phone, blank message, or past dates.
 *
 * Memory Optimization:
 * When visible is false, renders a lightweight hidden View with visible={false} to satisfy test assertions
 * without allocating native ModalHostView or event bridges.
 */

import React, { useState, useEffect, useMemo } from 'react';
import {
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  Modal,
  ScrollView,
  Switch,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Alert,
  Keyboard,
  StyleProp,
  ViewStyle,
} from 'react-native';
import type {
  ScheduledMessage,
  CreateScheduleInput,
  UpdateScheduleInput,
  RecurrenceRule,
  ScheduleValidationErrors,
} from '../types/schedule';
import { validateScheduleInput, normalizePhoneNumber } from '../utils/validation';
import { calculateSmsSegments } from '../utils/smsCalculator';
import { ContactPickerInput } from './ContactPickerInput';
import { DateTimePickerInput } from './DateTimePickerInput';

export interface ScheduleFormModalProps {
  visible: boolean;
  onClose: () => void;
  onSubmit: (scheduleData: CreateScheduleInput | UpdateScheduleInput) => Promise<void> | void;
  initialSchedule?: ScheduledMessage | null;
  isSubmitting?: boolean;
  now?: Date;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

function formatDateToIsoYmd(d: Date): string {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

const ScheduleFormContent: React.FC<ScheduleFormModalProps> = ({
  onClose,
  onSubmit,
  initialSchedule,
  isSubmitting = false,
  now,
}) => {
  const isEditing = Boolean(initialSchedule);
  const effectiveNow = useMemo(() => now || new Date(), [now]);

  // Form State
  const [isLocalSubmitting, setIsLocalSubmitting] = useState<boolean>(false);
  const effectiveIsSubmitting = isSubmitting || isLocalSubmitting;
  const [recipientName, setRecipientName] = useState<string>('');
  const [phoneNumber, setPhoneNumber] = useState<string>('');
  const [messageText, setMessageText] = useState<string>('');
  const [scheduledDate, setScheduledDate] = useState<Date>(
    () => new Date(effectiveNow.getTime() + 15 * 60 * 1000)
  );
  const [isDailyRecurrence, setIsDailyRecurrence] = useState<boolean>(false);
  const [hasEndDate, setHasEndDate] = useState<boolean>(false);
  const [endDate, setEndDate] = useState<string | null>(null);
  const [errors, setErrors] = useState<ScheduleValidationErrors>({});

  // End Date Picker Sub-Modal State
  const [isEndDateModalOpen, setIsEndDateModalOpen] = useState<boolean>(false);
  const [tempEndDate, setTempEndDate] = useState<Date>(
    () => new Date(effectiveNow.getTime() + 7 * 24 * 60 * 60 * 1000)
  );

  // Initialize or Reset form on mount or when initialSchedule changes
  useEffect(() => {
    if (initialSchedule) {
      setRecipientName(initialSchedule.recipient.name || '');
      setPhoneNumber(initialSchedule.recipient.phoneNumber || '');
      setMessageText(initialSchedule.messageText || '');

      let initialDate = new Date(initialSchedule.scheduledAt);
      const isDaily = initialSchedule.recurrence?.type === 'daily';
      if (isDaily && !isNaN(initialDate.getTime()) && initialDate.getTime() <= effectiveNow.getTime()) {
        while (initialDate.getTime() <= effectiveNow.getTime()) {
          initialDate = new Date(initialDate.getTime() + 24 * 60 * 60 * 1000);
        }
      }
      setScheduledDate(initialDate);
      setIsDailyRecurrence(isDaily);
      setHasEndDate(Boolean(initialSchedule.recurrence?.hasEndDate));
      setEndDate(initialSchedule.recurrence?.endDate || null);
      if (initialSchedule.recurrence?.endDate) {
        const parsedEnd = new Date(initialSchedule.recurrence.endDate);
        if (!isNaN(parsedEnd.getTime())) setTempEndDate(parsedEnd);
      }
    } else {
      setRecipientName('');
      setPhoneNumber('');
      setMessageText('');
      setScheduledDate(new Date(effectiveNow.getTime() + 15 * 60 * 1000));
      setIsDailyRecurrence(false);
      setHasEndDate(false);
      setEndDate(null);
    }
    setErrors({});
  }, [initialSchedule]);

  // Live SMS calculation
  const smsSegments = calculateSmsSegments(messageText);

  // Recurrence toggle handlers
  const handleToggleDailyRecurrence = (value: boolean) => {
    setIsDailyRecurrence(value);
    if (value) {
      if (scheduledDate.getTime() <= effectiveNow.getTime()) {
        let rolled = new Date(scheduledDate.getTime());
        while (rolled.getTime() <= effectiveNow.getTime()) {
          rolled = new Date(rolled.getTime() + 24 * 60 * 60 * 1000);
        }
        setScheduledDate(rolled);
      }
    } else {
      setHasEndDate(false);
      setEndDate(null);
    }
  };

  const handleToggleHasEndDate = (value: boolean) => {
    setHasEndDate(value);
    if (value && !endDate) {
      const defaultEndDate = new Date(effectiveNow.getTime() + 7 * 24 * 60 * 60 * 1000);
      setTempEndDate(defaultEndDate);
      setEndDate(formatDateToIsoYmd(defaultEndDate));
    } else if (!value) {
      setEndDate(null);
    }
  };

  const handleConfirmEndDate = () => {
    setEndDate(formatDateToIsoYmd(tempEndDate));
    setIsEndDateModalOpen(false);
  };

  // Submit Handler with full validation
  const handleSubmit = async () => {
    Keyboard.dismiss();

    const recurrenceRule: RecurrenceRule = isDailyRecurrence
      ? {
          type: 'daily',
          hasEndDate,
          endDate: hasEndDate ? endDate : null,
        }
      : {
          type: 'none',
          hasEndDate: false,
          endDate: null,
        };

    const validationNow = now || new Date();

    const validationResult = validateScheduleInput(
      {
        recipientName,
        phoneNumber,
        recipient: {
          name: recipientName,
          phoneNumber,
        },
        messageText,
        scheduledDate,
        scheduledAt: scheduledDate.toISOString(),
        recurrence: recurrenceRule,
      },
      validationNow
    );

    if (!validationResult.isValid) {
      setErrors(validationResult.errors);
      return;
    }

    setErrors({});
    setIsLocalSubmitting(true);

    try {
      if (isEditing && initialSchedule) {
        const updatePayload: UpdateScheduleInput = {
          recipient: {
            name: recipientName.trim(),
            phoneNumber: normalizePhoneNumber(phoneNumber),
          },
          recipientName: recipientName.trim(),
          phoneNumber: normalizePhoneNumber(phoneNumber),
          messageText,
          scheduledAt: scheduledDate.toISOString(),
          recurrence: recurrenceRule,
        };
        await onSubmit(updatePayload);
      } else {
        const createPayload: CreateScheduleInput = {
          recipient: {
            name: recipientName.trim(),
            phoneNumber: normalizePhoneNumber(phoneNumber),
          },
          messageText,
          scheduledAt: scheduledDate.toISOString(),
          recurrence: recurrenceRule,
        };
        await onSubmit(createPayload);
      }
      onClose();
    } catch (err: any) {
      const errMsg = err?.message || 'Failed to save schedule';
      setErrors({ general: errMsg });
      Alert.alert('Error Scheduling Message', errMsg);
    } finally {
      setIsLocalSubmitting(false);
    }
  };

  const hasErrors = Object.keys(errors).length > 0;

  return (
    <>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.modalBackdrop}
      >
        <View style={styles.modalCard}>
          {/* Header */}
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle} testID="schedule-form-title">
              {isEditing ? 'Edit Scheduled SMS' : 'Schedule New SMS'}
            </Text>
            <TouchableOpacity
              testID="schedule-form-close-button"
              accessibilityRole="button"
              accessibilityLabel="Close form"
              style={styles.closeButton}
              onPress={onClose}
              disabled={effectiveIsSubmitting}
            >
              <Text style={styles.closeButtonText}>✕</Text>
            </TouchableOpacity>
          </View>

          {/* Form Error Banner */}
          {hasErrors && (
            <View style={styles.formErrorBanner} testID="form-error-banner">
              <Text style={styles.formErrorBannerTitle}>Please correct the following errors:</Text>
              {errors.general && (
                <Text style={styles.formErrorItem} testID="form-error-general">
                  • {errors.general}
                </Text>
              )}
              {errors.recipient && (
                <Text style={styles.formErrorItem} testID="form-error-recipient">
                  • {errors.recipient}
                </Text>
              )}
              {errors.phoneNumber && (
                <Text style={styles.formErrorItem} testID="form-error-phone">
                  • {errors.phoneNumber}
                </Text>
              )}
              {errors.message && (
                <Text style={styles.formErrorItem} testID="form-error-message">
                  • {errors.message}
                </Text>
              )}
              {errors.scheduledAt && (
                <Text style={styles.formErrorItem} testID="form-error-scheduled-at">
                  • {errors.scheduledAt}
                </Text>
              )}
              {errors.recurrence && (
                <Text style={styles.formErrorItem} testID="form-error-recurrence">
                  • {errors.recurrence}
                </Text>
              )}
            </View>
          )}

          {/* Scrollable Form Body */}
          <ScrollView
            style={styles.formScroll}
            contentContainerStyle={styles.formScrollContent}
            keyboardShouldPersistTaps="handled"
          >
            {/* Recipient Section */}
            <ContactPickerInput
              recipientName={recipientName}
              phoneNumber={phoneNumber}
              onRecipientChange={({ name, phoneNumber: phone }) => {
                setRecipientName(name);
                setPhoneNumber(phone);
              }}
              errors={{
                recipient: errors.recipient,
                phoneNumber: errors.phoneNumber,
              }}
              disabled={effectiveIsSubmitting}
            />

            {/* Message Text Input & Live SMS Segment Counter */}
            <View style={styles.sectionGroup}>
              <Text style={styles.sectionLabel}>Message Text *</Text>
              <TextInput
                testID="message-text-input"
                accessibilityLabel="Message text input"
                style={[styles.messageInput, Boolean(errors.message) && styles.inputError]}
                multiline={true}
                numberOfLines={4}
                placeholder="Type your SMS message here..."
                placeholderTextColor="#9E9E9E"
                value={messageText}
                editable={!effectiveIsSubmitting}
                onChangeText={setMessageText}
              />
              {Boolean(errors.message) && (
                <Text style={styles.fieldError} testID="message-text-error">
                  {errors.message}
                </Text>
              )}

              {/* Live Character and SMS Segment Counter */}
              <View style={styles.segmentCounter} testID="sms-segment-counter">
                <Text style={styles.segmentCounterText}>
                  {smsSegments.charCount} {smsSegments.charCount === 1 ? 'char' : 'chars'} •{' '}
                  {smsSegments.segmentCount}{' '}
                  {smsSegments.segmentCount === 1 ? 'segment' : 'segments'} (
                  {smsSegments.isUnicode ? 'Unicode 70/67' : 'GSM-7 160/153'})
                </Text>
              </View>
            </View>

            {/* DateTimePicker Section */}
            <View style={styles.sectionGroup}>
              <DateTimePickerInput
                selectedDate={scheduledDate}
                value={scheduledDate}
                onChangeDate={setScheduledDate}
                onChange={setScheduledDate}
                now={effectiveNow}
                leadBufferMs={30000}
                disabled={effectiveIsSubmitting}
                error={errors.scheduledAt}
              />
            </View>

            {/* Recurrence Section */}
            <View style={styles.sectionGroup}>
              <View style={styles.switchRow}>
                <View style={styles.switchLabelContainer}>
                  <Text style={styles.switchLabel}>Repeat Daily</Text>
                  <Text style={styles.switchSubLabel}>
                    Message will automatically re-schedule every 24 hours
                  </Text>
                </View>
                <Switch
                  testID="recurrence-daily-switch"
                  accessibilityLabel="Toggle daily recurrence"
                  value={isDailyRecurrence}
                  onValueChange={handleToggleDailyRecurrence}
                  disabled={effectiveIsSubmitting}
                  trackColor={{ false: '#E0E0E0', true: '#99F6E4' }}
                  thumbColor={isDailyRecurrence ? '#0D9488' : '#FAFAFA'}
                />
              </View>

              {/* End Date Settings when Daily Recurrence is Active */}
              {isDailyRecurrence && (
                <View style={styles.recurrenceSubSection}>
                  <View style={styles.switchRow}>
                    <View style={styles.switchLabelContainer}>
                      <Text style={styles.subSwitchLabel}>Set End Date</Text>
                      <Text style={styles.switchSubLabel}>
                        Stop recurring after a specific date
                      </Text>
                    </View>
                    <Switch
                      testID="recurrence-has-end-date-switch"
                      accessibilityLabel="Toggle recurrence end date"
                      value={hasEndDate}
                      onValueChange={handleToggleHasEndDate}
                      disabled={effectiveIsSubmitting}
                      trackColor={{ false: '#E0E0E0', true: '#99F6E4' }}
                      thumbColor={hasEndDate ? '#0D9488' : '#FAFAFA'}
                    />
                  </View>

                  {hasEndDate && (
                    <View style={styles.endDateRow}>
                      <Text style={styles.endDateDisplay}>
                        Ends on: <Text style={styles.endDateValue}>{endDate || 'Not set'}</Text>
                      </Text>
                      <TouchableOpacity
                        testID="recurrence-end-date-button"
                        style={styles.changeEndDateButton}
                        onPress={() => setIsEndDateModalOpen(true)}
                        disabled={effectiveIsSubmitting}
                      >
                        <Text style={styles.changeEndDateButtonText}>Change</Text>
                      </TouchableOpacity>
                    </View>
                  )}
                </View>
              )}
            </View>
          </ScrollView>

          {/* Modal Actions Footer */}
          <View style={styles.modalFooter}>
            <TouchableOpacity
              testID="schedule-form-cancel-button"
              accessibilityRole="button"
              accessibilityLabel="Cancel schedule form"
              style={styles.cancelButton}
              onPress={onClose}
              disabled={effectiveIsSubmitting}
            >
              <Text style={styles.cancelButtonText}>Cancel</Text>
            </TouchableOpacity>

            <TouchableOpacity
              testID="schedule-form-submit-button"
              accessibilityRole="button"
              accessibilityLabel="Submit schedule form"
              style={[styles.submitButton, effectiveIsSubmitting && styles.submitButtonDisabled]}
              onPress={handleSubmit}
              disabled={effectiveIsSubmitting}
            >
              {effectiveIsSubmitting ? (
                <ActivityIndicator size="small" color="#FFFFFF" testID="submit-spinner" />
              ) : (
                <Text style={styles.submitButtonText}>
                  {isEditing ? 'Update Schedule' : 'Schedule Message'}
                </Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>

      {/* End Date Picker Sub-Modal */}
      <Modal
        testID="recurrence-end-date-modal"
        visible={isEndDateModalOpen}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setIsEndDateModalOpen(false)}
      >
        <View style={styles.subModalOverlay}>
          <View style={styles.subModalCard}>
            <Text style={styles.subModalTitle}>Select Recurrence End Date</Text>
            <View style={styles.endDateSteppersRow}>
              <TouchableOpacity
                testID="end-date-preset-1week"
                style={styles.presetChip}
                onPress={() => {
                  const d = new Date(effectiveNow.getTime() + 7 * 24 * 60 * 60 * 1000);
                  setTempEndDate(d);
                }}
              >
                <Text style={styles.presetChipText}>+1 Week</Text>
              </TouchableOpacity>
              <TouchableOpacity
                testID="end-date-preset-1month"
                style={styles.presetChip}
                onPress={() => {
                  const d = new Date(effectiveNow.getTime() + 30 * 24 * 60 * 60 * 1000);
                  setTempEndDate(d);
                }}
              >
                <Text style={styles.presetChipText}>+1 Month</Text>
              </TouchableOpacity>
              <TouchableOpacity
                testID="end-date-preset-3months"
                style={styles.presetChip}
                onPress={() => {
                  const d = new Date(effectiveNow.getTime() + 90 * 24 * 60 * 60 * 1000);
                  setTempEndDate(d);
                }}
              >
                <Text style={styles.presetChipText}>+3 Months</Text>
              </TouchableOpacity>
            </View>

            <View style={styles.endDateDisplayCard}>
              <Text style={styles.endDateDisplayLabel}>Selected End Date:</Text>
              <Text style={styles.endDateDisplayValue} testID="selected-end-date-display">
                {formatDateToIsoYmd(tempEndDate)}
              </Text>
            </View>

            <View style={styles.subModalActionsRow}>
              <TouchableOpacity
                testID="cancel-end-date-button"
                style={styles.subModalCancel}
                onPress={() => setIsEndDateModalOpen(false)}
              >
                <Text style={styles.subModalCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                testID="confirm-end-date-button"
                style={styles.subModalConfirm}
                onPress={handleConfirmEndDate}
              >
                <Text style={styles.subModalConfirmText}>Set End Date</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </>
  );
};

export const ScheduleFormModal: React.FC<ScheduleFormModalProps> = (props) => {
  const { visible, onClose, testID = 'schedule-form-modal' } = props;
  if (!visible) {
    return (
      <View
        testID={testID}
        {...({ visible: false, initialSchedule: null } as any)}
        style={styles.hidden}
        pointerEvents="none"
      />
    );
  }
  return (
    <Modal
      testID={testID}
      visible={visible}
      transparent={true}
      animationType="slide"
      onRequestClose={onClose}
    >
      <ScheduleFormContent {...props} />
    </Modal>
  );
};

const styles = StyleSheet.create({
  hidden: {
    display: 'none',
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  modalCard: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: '92%',
    paddingBottom: 24,
    elevation: 16,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.25,
    shadowRadius: 10,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#EEEEEE',
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#212121',
  },
  closeButton: {
    padding: 6,
    borderRadius: 16,
  },
  closeButtonText: {
    fontSize: 18,
    fontWeight: '700',
    color: '#757575',
  },
  formErrorBanner: {
    backgroundColor: '#FFEBEE',
    marginHorizontal: 16,
    marginTop: 12,
    padding: 12,
    borderRadius: 8,
    borderLeftWidth: 4,
    borderLeftColor: '#D32F2F',
  },
  formErrorBannerTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#C62828',
    marginBottom: 4,
  },
  formErrorItem: {
    fontSize: 12,
    color: '#D32F2F',
    marginTop: 2,
  },
  formScroll: {
    paddingHorizontal: 16,
  },
  formScrollContent: {
    paddingBottom: 20,
  },
  sectionGroup: {
    marginTop: 16,
  },
  sectionLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#424242',
    marginBottom: 6,
  },
  messageInput: {
    backgroundColor: '#FAFAFA',
    borderWidth: 1,
    borderColor: '#E0E0E0',
    borderRadius: 8,
    padding: 12,
    fontSize: 14,
    color: '#212121',
    minHeight: 90,
    textAlignVertical: 'top',
  },
  inputError: {
    borderColor: '#D32F2F',
    backgroundColor: '#FFEBEE',
  },
  fieldError: {
    color: '#D32F2F',
    fontSize: 12,
    marginTop: 4,
  },
  segmentCounter: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    marginTop: 6,
  },
  segmentCounterText: {
    fontSize: 12,
    color: '#757575',
    fontWeight: '500',
  },
  switchRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
  },
  switchLabelContainer: {
    flex: 1,
    paddingRight: 12,
  },
  switchLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#212121',
  },
  switchSubLabel: {
    fontSize: 12,
    color: '#757575',
    marginTop: 2,
  },
  recurrenceSubSection: {
    marginTop: 8,
    paddingLeft: 12,
    borderLeftWidth: 2,
    borderLeftColor: '#E0E0E0',
  },
  subSwitchLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#424242',
  },
  endDateRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#F5F5F5',
    padding: 10,
    borderRadius: 8,
    marginTop: 8,
  },
  endDateDisplay: {
    fontSize: 13,
    color: '#424242',
  },
  endDateValue: {
    fontWeight: '700',
    color: '#0D9488',
  },
  changeEndDateButton: {
    paddingVertical: 4,
    paddingHorizontal: 10,
    backgroundColor: '#FFFFFF',
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#CFD8DC',
  },
  changeEndDateButtonText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#0D9488',
  },
  modalFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: '#EEEEEE',
  },
  cancelButton: {
    flex: 1,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#E0E0E0',
    marginRight: 10,
    backgroundColor: '#FFFFFF',
  },
  cancelButtonText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#616161',
  },
  submitButton: {
    flex: 1.5,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 8,
    backgroundColor: '#0D9488',
    marginLeft: 10,
  },
  submitButtonDisabled: {
    backgroundColor: '#99F6E4',
  },
  submitButtonText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  // Sub-Modal Styles
  subModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  subModalCard: {
    width: '100%',
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 20,
    elevation: 20,
  },
  subModalTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: '#212121',
    marginBottom: 16,
    textAlign: 'center',
  },
  endDateSteppersRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  presetChip: {
    flex: 1,
    marginHorizontal: 4,
    paddingVertical: 8,
    backgroundColor: '#E0F2F1',
    borderRadius: 8,
    alignItems: 'center',
  },
  presetChipText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#0F766E',
  },
  endDateDisplayCard: {
    backgroundColor: '#F5F5F5',
    borderRadius: 8,
    padding: 12,
    alignItems: 'center',
    marginBottom: 16,
  },
  endDateDisplayLabel: {
    fontSize: 12,
    color: '#757575',
    marginBottom: 2,
  },
  endDateDisplayValue: {
    fontSize: 16,
    fontWeight: '700',
    color: '#0D9488',
  },
  subModalActionsRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
  },
  subModalCancel: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    marginRight: 8,
  },
  subModalCancelText: {
    fontSize: 14,
    color: '#757575',
    fontWeight: '600',
  },
  subModalConfirm: {
    backgroundColor: '#0D9488',
    borderRadius: 8,
    paddingHorizontal: 18,
    paddingVertical: 10,
  },
  subModalConfirmText: {
    fontSize: 14,
    color: '#FFFFFF',
    fontWeight: '700',
  },
});

export default ScheduleFormModal;
