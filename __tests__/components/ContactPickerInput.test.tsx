import React from 'react';
import ReactTestRenderer, { act } from 'react-test-renderer';
import { Platform, PermissionsAndroid, NativeModules } from 'react-native';
import { ContactPickerInput } from '../../src/components/ContactPickerInput';

describe('ContactPickerInput Component Unit & Integration Tests', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    Platform.OS = 'android';
  });

  it('renders recipient name and phone number inputs with initial values', () => {
    const onChangeMock = jest.fn();
    let renderer!: ReactTestRenderer.ReactTestRenderer;
    act(() => {
      renderer = ReactTestRenderer.create(
        <ContactPickerInput
          recipientName="Bob Marley"
          phoneNumber="+15551234567"
          onRecipientChange={onChangeMock}
        />
      );
    });

    const nameInput = renderer.root.findByProps({ testID: 'recipient-name-input' });
    const phoneInput = renderer.root.findByProps({ testID: 'recipient-phone-input' });

    expect(nameInput.props.value).toBe('Bob Marley');
    expect(phoneInput.props.value).toBe('+15551234567');
  });

  it('invokes onRecipientChange when user edits recipient name', () => {
    const onChangeMock = jest.fn();
    let renderer!: ReactTestRenderer.ReactTestRenderer;
    act(() => {
      renderer = ReactTestRenderer.create(
        <ContactPickerInput
          recipientName=""
          phoneNumber="1234567890"
          onRecipientChange={onChangeMock}
        />
      );
    });

    const nameInput = renderer.root.findByProps({ testID: 'recipient-name-input' });
    act(() => {
      nameInput.props.onChangeText('Charlie');
    });

    expect(onChangeMock).toHaveBeenCalledWith({
      name: 'Charlie',
      phoneNumber: '1234567890',
    });
  });

  it('invokes onRecipientChange when user edits phone number', () => {
    const onChangeMock = jest.fn();
    let renderer!: ReactTestRenderer.ReactTestRenderer;
    act(() => {
      renderer = ReactTestRenderer.create(
        <ContactPickerInput
          recipientName="David"
          phoneNumber=""
          onRecipientChange={onChangeMock}
        />
      );
    });

    const phoneInput = renderer.root.findByProps({ testID: 'recipient-phone-input' });
    act(() => {
      phoneInput.props.onChangeText('+15559998888');
    });

    expect(onChangeMock).toHaveBeenCalledWith({
      name: 'David',
      phoneNumber: '+15559998888',
    });
  });

  it('displays valid badge when an E.164 phone number is entered', () => {
    let renderer!: ReactTestRenderer.ReactTestRenderer;
    act(() => {
      renderer = ReactTestRenderer.create(
        <ContactPickerInput
          recipientName="Eve"
          phoneNumber="+14155552671"
          onRecipientChange={jest.fn()}
        />
      );
    });

    const validBadge = renderer.root.findByProps({ testID: 'phone-validation-valid' });
    expect(validBadge).toBeDefined();
  });

  it('displays valid badge for 10-digit national dialable numbers', () => {
    let renderer!: ReactTestRenderer.ReactTestRenderer;
    act(() => {
      renderer = ReactTestRenderer.create(
        <ContactPickerInput
          recipientName="Frank"
          phoneNumber="9876543210"
          onRecipientChange={jest.fn()}
        />
      );
    });

    const validBadge = renderer.root.findByProps({ testID: 'phone-validation-valid' });
    expect(validBadge).toBeDefined();
  });

  it('displays invalid badge when a phone number is too short', () => {
    let renderer!: ReactTestRenderer.ReactTestRenderer;
    act(() => {
      renderer = ReactTestRenderer.create(
        <ContactPickerInput
          recipientName="Grace"
          phoneNumber="12345"
          onRecipientChange={jest.fn()}
        />
      );
    });

    const invalidBadge = renderer.root.findByProps({ testID: 'phone-validation-invalid' });
    expect(invalidBadge).toBeDefined();
  });

  it('displays invalid badge when a phone number contains non-dialable alpha characters', () => {
    let renderer!: ReactTestRenderer.ReactTestRenderer;
    act(() => {
      renderer = ReactTestRenderer.create(
        <ContactPickerInput
          recipientName="Grace"
          phoneNumber="abc-def"
          onRecipientChange={jest.fn()}
        />
      );
    });

    const invalidBadge = renderer.root.findByProps({ testID: 'phone-validation-invalid' });
    expect(invalidBadge).toBeDefined();
  });

  it('displays error messages when errors prop is supplied', () => {
    let renderer!: ReactTestRenderer.ReactTestRenderer;
    act(() => {
      renderer = ReactTestRenderer.create(
        <ContactPickerInput
          recipientName=""
          phoneNumber=""
          onRecipientChange={jest.fn()}
          errors={{
            recipient: 'Recipient name is required.',
            phoneNumber: 'Phone number is required.',
          }}
        />
      );
    });

    const nameError = renderer.root.findByProps({ testID: 'recipient-name-error' });
    const phoneError = renderer.root.findByProps({ testID: 'recipient-phone-error' });

    expect(nameError.props.children).toBe('Recipient name is required.');
    expect(phoneError.props.children).toBe('Phone number is required.');
  });

  it('requests READ_CONTACTS permission and queries NativeModules.ContactPickerModule when button is tapped', async () => {
    PermissionsAndroid.check = jest.fn().mockResolvedValue(false);
    PermissionsAndroid.request = jest.fn().mockResolvedValue(PermissionsAndroid.RESULTS.GRANTED);
    NativeModules.ContactPickerModule.pickContact = jest.fn().mockResolvedValue({
      displayName: 'Sarah Connor',
      phoneNumber: '+15553334444',
    });

    const onChangeMock = jest.fn();
    let renderer!: ReactTestRenderer.ReactTestRenderer;
    act(() => {
      renderer = ReactTestRenderer.create(
        <ContactPickerInput
          recipientName=""
          phoneNumber=""
          onRecipientChange={onChangeMock}
        />
      );
    });

    const pickButton = renderer.root.findByProps({ testID: 'pick-contact-button' });
    await act(async () => {
      await pickButton.props.onPress();
    });

    expect(PermissionsAndroid.check).toHaveBeenCalledWith(PermissionsAndroid.PERMISSIONS.READ_CONTACTS);
    expect(PermissionsAndroid.request).toHaveBeenCalledWith(
      PermissionsAndroid.PERMISSIONS.READ_CONTACTS,
      expect.any(Object)
    );
    expect(NativeModules.ContactPickerModule.pickContact).toHaveBeenCalled();
    expect(onChangeMock).toHaveBeenCalledWith({
      name: 'Sarah Connor',
      phoneNumber: '+15553334444',
    });
  });

  it('handles permission denial gracefully and informs the user without throwing', async () => {
    PermissionsAndroid.check = jest.fn().mockResolvedValue(false);
    PermissionsAndroid.request = jest.fn().mockResolvedValue(PermissionsAndroid.RESULTS.DENIED);

    const onChangeMock = jest.fn();
    let renderer!: ReactTestRenderer.ReactTestRenderer;
    act(() => {
      renderer = ReactTestRenderer.create(
        <ContactPickerInput
          recipientName=""
          phoneNumber=""
          onRecipientChange={onChangeMock}
        />
      );
    });

    const pickButton = renderer.root.findByProps({ testID: 'pick-contact-button' });
    await act(async () => {
      await pickButton.props.onPress();
    });

    expect(onChangeMock).not.toHaveBeenCalled();
    const notice = renderer.root.findByProps({ testID: 'contact-picker-notice' });
    expect(notice).toBeDefined();
  });
});
