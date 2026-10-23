import React from 'react';
import {
  KeyboardAvoidingView,
  ScrollView,
  Platform,
  StyleSheet,
  ViewStyle,
  ScrollViewProps,
} from 'react-native';

interface Props {
  children: React.ReactNode;
  /** Extra container styles */
  style?: ViewStyle;
  /** ScrollView contentContainerStyle */
  contentContainerStyle?: ViewStyle;
  /** Extra keyboard offset (e.g. for headers) — default 0 */
  keyboardVerticalOffset?: number;
  /** Pass false to disable internal ScrollView (e.g. chat screens with their own scroll) */
  scrollEnabled?: boolean;
  /** Extra ScrollView props */
  scrollViewProps?: ScrollViewProps;
}

/**
 * Global wrapper that ensures the keyboard never covers input fields.
 *
 * - iOS: Uses `padding` behaviour with vertical offset
 * - Android: Uses `height` behaviour (works best with adjustResize)
 *
 * Drop this into any screen that has text inputs.
 */
export function KeyboardAwareWrapper({
  children,
  style,
  contentContainerStyle,
  keyboardVerticalOffset = 0,
  scrollEnabled = true,
  scrollViewProps,
}: Props) {
  return (
    <KeyboardAvoidingView
      style={[styles.container, style]}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={keyboardVerticalOffset}
    >
      {scrollEnabled ? (
        <ScrollView
          contentContainerStyle={[styles.scrollContent, contentContainerStyle]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          bounces={false}
          {...scrollViewProps}
        >
          {children}
        </ScrollView>
      ) : (
        children
      )}
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
  },
});
