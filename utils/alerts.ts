import { Alert as RNAlert, Platform } from 'react-native';

/**
 * A cross-platform Alert utility that provides web parity for React Native Alert.
 */
export const Alert = {
  alert: (
    title: string,
    message?: string,
    buttons?: { text: string; onPress?: () => void; style?: 'default' | 'cancel' | 'destructive' }[],
    options?: { cancelable?: boolean; onDismiss?: () => void }
  ) => {
    if (Platform.OS === 'web') {
      const fullMessage = message ? `${title}\n\n${message}` : title;

      if (!buttons || buttons.length === 0) {
        window.alert(fullMessage);
      } else if (buttons.length === 1) {
        window.alert(fullMessage);
        if (buttons[0].onPress) buttons[0].onPress();
      } else {
        // Find the "Confirm" and "Cancel" buttons
        const cancelButton = buttons.find((b) => b.style === 'cancel');
        const defaultButton = buttons.find((b) => b.style !== 'cancel');

        const confirmed = window.confirm(fullMessage);
        
        if (confirmed) {
          if (defaultButton && defaultButton.onPress) defaultButton.onPress();
        } else {
          if (cancelButton && cancelButton.onPress) cancelButton.onPress();
        }
      }
    } else {
      RNAlert.alert(title, message, buttons, options);
    }
  },
};
