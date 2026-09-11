/**
 * Sked SMS — Contact Picker & Manual Recipient Input
 * Target: src/components/ContactPickerInput.tsx
 *
 * Supports native device contact selection via READ_CONTACTS and ContactPickerModule,
 * with graceful fallback to manual name and phone number input.
 * Includes live E.164 and local dialable phone validation indicator.
 */

import React, { useState, useRef } from 'react';
import {
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  Platform,
  PermissionsAndroid,
  NativeModules,
  StyleProp,
  ViewStyle,
} from 'react-native';
import { validatePhoneNumber, normalizePhoneNumber } from '../utils/validation';

export interface ContactPickerInputProps {
  recipientName: string;
  phoneNumber: string;
  onRecipientChange: (recipient: { name: string; phoneNumber: string }) => void;
  errors?: {
    recipient?: string;
    phoneNumber?: string;
  };
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

export const ContactPickerInput: React.FC<ContactPickerInputProps> = ({
  recipientName,
  phoneNumber,
  onRecipientChange,
  errors,
  disabled = false,
  style,
  testID = 'contact-picker-input-container',
}) => {
  const [permissionNotice, setPermissionNotice] = useState<string | null>(null);
  const [isPicking, setIsPicking] = useState<boolean>(false);

  // Sync refs to prevent stale closure data during batch synchronous input changes
  const currentNameRef = useRef<string>(recipientName);
  const currentPhoneRef = useRef<string>(phoneNumber);
  currentNameRef.current = recipientName;
  currentPhoneRef.current = phoneNumber;

  const handlePickContact = async () => {
    if (disabled || isPicking) return;
    setIsPicking(true);
    setPermissionNotice(null);

    try {
      if (Platform.OS === 'android') {
        const permission = PermissionsAndroid.PERMISSIONS.READ_CONTACTS;
        const hasPermission = await PermissionsAndroid.check(permission);

        if (!hasPermission) {
          const granted = await PermissionsAndroid.request(permission, {
            title: 'Contacts Permission',
            message: 'Sked SMS needs access to your contacts to select a recipient.',
            buttonPositive: 'OK',
            buttonNegative: 'Cancel',
          });

          if (granted !== PermissionsAndroid.RESULTS.GRANTED) {
            setPermissionNotice('Contacts permission was denied. Please enter recipient manually.');
            setIsPicking(false);
            return;
          }
        }
      }

      const contactPickerModule = NativeModules.ContactPickerModule;
      if (contactPickerModule && typeof contactPickerModule.pickContact === 'function') {
        const contact = await contactPickerModule.pickContact();
        if (contact) {
          const name = contact.displayName || contact.name || '';
          const phone = contact.phoneNumber || contact.phone || '';
          if (name || phone) {
            const finalName = name || currentNameRef.current;
            const finalPhone = phone || currentPhoneRef.current;
            currentNameRef.current = finalName;
            currentPhoneRef.current = finalPhone;
            onRecipientChange({
              name: finalName,
              phoneNumber: finalPhone,
            });
            setPermissionNotice(null);
            setIsPicking(false);
            return;
          }
        }
      } else {
        setPermissionNotice('Device contact picker is not available. Please enter details manually.');
      }
    } catch (err: any) {
      const errorMsg = err?.message || 'Contact selection cancelled. Enter details manually.';
      setPermissionNotice(errorMsg);
    } finally {
      setIsPicking(false);
    }
  };

  // Live phone validation indicator
  const cleanPhone = phoneNumber.trim();
  const phoneValidation = cleanPhone.length > 0 ? validatePhoneNumber(cleanPhone) : null;

  return (
    <View style={[styles.container, style]} testID={testID}>
      {/* Header & Device Picker Action */}
      <View style={styles.headerRow}>
        <Text style={styles.sectionTitle}>Recipient Information</Text>
        <TouchableOpacity
          testID="pick-contact-button"
          accessibilityRole="button"
          accessibilityLabel="Pick recipient from device contacts"
          disabled={disabled || isPicking}
          onPress={handlePickContact}
          style={[styles.pickButton, (disabled || isPicking) && styles.pickButtonDisabled]}
        >
          <Text style={styles.pickButtonText}>
            {isPicking ? 'Opening...' : '👤 Pick from Contacts'}
          </Text>
        </TouchableOpacity>
      </View>

      {/* Permission or Fallback Notice */}
      {permissionNotice && (
        <View style={styles.noticeBanner} testID="contact-picker-notice">
          <Text style={styles.noticeText}>ℹ {permissionNotice}</Text>
        </View>
      )}

      {/* Recipient Name Field */}
      <View style={styles.fieldGroup}>
        <Text style={styles.label}>Recipient Name *</Text>
        <TextInput
          testID="recipient-name-input"
          accessibilityLabel="Recipient Name"
          style={[styles.input, Boolean(errors?.recipient) && styles.inputError]}
          placeholder="e.g. Alice Smith"
          placeholderTextColor="#9E9E9E"
          value={recipientName}
          editable={!disabled}
          onChangeText={(val) => {
            currentNameRef.current = val;
            onRecipientChange({ name: val, phoneNumber: currentPhoneRef.current });
          }}
        />
        {Boolean(errors?.recipient) && (
          <Text style={styles.errorText} testID="recipient-name-error">
            {errors?.recipient}
          </Text>
        )}
      </View>

      {/* Recipient Phone Number Field */}
      <View style={styles.fieldGroup}>
        <Text style={styles.label}>Phone Number * (E.164 or Local)</Text>
        <TextInput
          testID="recipient-phone-input"
          accessibilityLabel="Recipient Phone Number"
          style={[styles.input, Boolean(errors?.phoneNumber) && styles.inputError]}
          placeholder="e.g. +1 555 123 4567 or 9876543210"
          placeholderTextColor="#9E9E9E"
          keyboardType="phone-pad"
          value={phoneNumber}
          editable={!disabled}
          onChangeText={(val) => {
            currentPhoneRef.current = val;
            onRecipientChange({ name: currentNameRef.current, phoneNumber: val });
          }}
        />
        {Boolean(errors?.phoneNumber) && (
          <Text style={styles.errorText} testID="recipient-phone-error">
            {errors?.phoneNumber}
          </Text>
        )}

        {/* Live Phone Validation Indicator */}
        {phoneValidation && (
          <View
            style={[
              styles.validationBadge,
              phoneValidation.isValid ? styles.validationBadgeValid : styles.validationBadgeInvalid,
            ]}
            testID={phoneValidation.isValid ? 'phone-validation-valid' : 'phone-validation-invalid'}
          >
            <Text
              style={[
                styles.validationBadgeText,
                phoneValidation.isValid
                  ? styles.validationBadgeTextValid
                  : styles.validationBadgeTextInvalid,
              ]}
            >
              {phoneValidation.isValid
                ? `✓ Valid Phone Number (${normalizePhoneNumber(cleanPhone)})`
                : `⚠ ${phoneValidation.error || 'Invalid phone format'}`}
            </Text>
          </View>
        )}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    marginVertical: 8,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#212121',
  },
  pickButton: {
    backgroundColor: '#E0F2F1',
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#80CBC4',
  },
  pickButtonDisabled: {
    backgroundColor: '#EEEEEE',
    borderColor: '#E0E0E0',
  },
  pickButtonText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#0F766E',
  },
  noticeBanner: {
    backgroundColor: '#FFF8E1',
    borderColor: '#FFE082',
    borderWidth: 1,
    borderRadius: 6,
    padding: 8,
    marginBottom: 8,
  },
  noticeText: {
    fontSize: 12,
    color: '#F57F17',
  },
  fieldGroup: {
    marginBottom: 12,
  },
  label: {
    fontSize: 13,
    fontWeight: '600',
    color: '#424242',
    marginBottom: 4,
  },
  input: {
    backgroundColor: '#FAFAFA',
    borderWidth: 1,
    borderColor: '#CFD8DC',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    color: '#212121',
  },
  inputError: {
    borderColor: '#E53935',
    backgroundColor: '#FFEBEE',
  },
  errorText: {
    fontSize: 12,
    color: '#D32F2F',
    marginTop: 4,
  },
  validationBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 6,
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 4,
  },
  validationBadgeValid: {
    backgroundColor: '#E8F5E9',
    borderColor: '#A5D6A7',
    borderWidth: 1,
  },
  validationBadgeInvalid: {
    backgroundColor: '#FFEBEE',
    borderColor: '#EF9A9A',
    borderWidth: 1,
  },
  validationBadgeText: {
    fontSize: 12,
    fontWeight: '500',
  },
  validationBadgeTextValid: {
    color: '#2E7D32',
  },
  validationBadgeTextInvalid: {
    color: '#C62828',
  },
});

export default ContactPickerInput;
