import { Feather, Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import React, { useEffect, useRef } from 'react';
import {
  ActivityIndicator,
  Animated,
  Easing,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  type TextInputProps,
  type TextStyle,
  View,
  type ViewStyle,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { type Palette, radius, useTheme } from './theme';

/* ------------------------------------------------------------------- text */

export function Txt({
  children,
  style,
  size = 14,
  weight = '400',
  color,
  numberOfLines,
  onPress,
}: {
  children: React.ReactNode;
  style?: TextStyle | TextStyle[];
  size?: number;
  weight?: TextStyle['fontWeight'];
  color?: string;
  numberOfLines?: number;
  onPress?: () => void;
}) {
  const { colors } = useTheme();
  return (
    <Text
      numberOfLines={numberOfLines}
      onPress={onPress}
      style={[{ fontSize: size, fontWeight: weight, color: color ?? colors.text }, style]}
    >
      {children}
    </Text>
  );
}

/* ------------------------------------------------------------------ layout */

export function Screen({
  children,
  scroll = false,
  padded = true,
  refreshControl,
}: {
  children: React.ReactNode;
  scroll?: boolean;
  padded?: boolean;
  refreshControl?: React.ComponentProps<typeof ScrollView>['refreshControl'];
}) {
  const { colors } = useTheme();
  const style: ViewStyle = { flex: 1, backgroundColor: colors.bgAlt };
  if (!scroll) {
    return <View style={[style, padded && { padding: 12 }]}>{children}</View>;
  }
  return (
    <ScrollView
      style={style}
      contentContainerStyle={[{ paddingBottom: 24 }, padded && { padding: 12 }]}
      refreshControl={refreshControl}
      keyboardShouldPersistTaps="handled"
    >
      {children}
    </ScrollView>
  );
}

export function Card({
  children,
  style,
  onPress,
}: {
  children: React.ReactNode;
  style?: ViewStyle;
  onPress?: () => void;
}) {
  const { colors } = useTheme();
  const base: ViewStyle = {
    backgroundColor: colors.card,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 14,
    marginBottom: 12,
    shadowColor: colors.shadow,
    shadowOpacity: 0.06,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 1,
  };
  if (onPress) {
    return (
      <Pressable onPress={onPress} style={({ pressed }) => [base, style, pressed && { opacity: 0.85 }]}>
        {children}
      </Pressable>
    );
  }
  return <View style={[base, style]}>{children}</View>;
}

export function Row({ children, style }: { children: React.ReactNode; style?: ViewStyle }) {
  return <View style={[{ flexDirection: 'row', alignItems: 'center' }, style]}>{children}</View>;
}

/* ------------------------------------------------------------------ inputs */

export function PrimaryButton({
  title,
  onPress,
  loading,
  disabled,
  style,
  variant = 'solid',
}: {
  title: string;
  onPress: () => void;
  loading?: boolean;
  disabled?: boolean;
  style?: ViewStyle;
  variant?: 'solid' | 'outline';
}) {
  const { colors } = useTheme();
  const isOutline = variant === 'outline';
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || loading}
      style={({ pressed }) => [
        {
          backgroundColor: isOutline ? 'transparent' : colors.primary,
          borderWidth: isOutline ? 1.5 : 0,
          borderColor: colors.primary,
          paddingVertical: 14,
          borderRadius: radius.md,
          alignItems: 'center',
          justifyContent: 'center',
          opacity: disabled ? 0.5 : pressed ? 0.85 : 1,
        },
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={isOutline ? colors.primary : colors.onPrimary} />
      ) : (
        <Txt size={15} weight="700" color={isOutline ? colors.primary : colors.onPrimary}>
          {title}
        </Txt>
      )}
    </Pressable>
  );
}

export function Field({
  label,
  icon,
  style,
  inputStyle,
  ...props
}: Omit<TextInputProps, 'style'> & {
  label?: string;
  icon?: keyof typeof Feather.glyphMap;
  /** wrapper style */
  style?: ViewStyle;
  inputStyle?: TextStyle;
}) {
  const { colors } = useTheme();
  return (
    <View style={[{ marginBottom: 14 }, style]}>
      {label ? (
        <Txt size={13} weight="600" color={colors.textMuted} style={{ marginBottom: 6 }}>
          {label}
        </Txt>
      ) : null}
      <Row
        style={{
          borderWidth: 1,
          borderColor: colors.border,
          backgroundColor: colors.card,
          borderRadius: radius.md,
          paddingHorizontal: 12,
        }}
      >
        {icon ? <Feather name={icon} size={18} color={colors.primary} style={{ marginRight: 8 }} /> : null}
        <TextInput
          placeholderTextColor={colors.textMuted}
          {...props}
          style={[{ flex: 1, paddingVertical: 12, fontSize: 15, color: colors.text }, inputStyle]}
        />
      </Row>
    </View>
  );
}

/* ------------------------------------------------------------------ pieces */

export function Logo({ size = 18 }: { size?: number }) {
  const { colors } = useTheme();
  return (
    <Row>
      <View
        style={{
          backgroundColor: colors.primary,
          paddingHorizontal: 8,
          paddingVertical: 3,
          borderRadius: 4,
        }}
      >
        <Txt size={size} weight="800" color="#FFFFFF" style={{ letterSpacing: 1 }}>
          RAMA
        </Txt>
      </View>
      <Txt size={size} weight="800" color={colors.text} style={{ marginLeft: 4 }}>
        777
      </Txt>
    </Row>
  );
}

export function Marquee({ text }: { text: string }) {
  const { colors } = useTheme();
  const fade = useRef(new Animated.Value(0.35)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(fade, { toValue: 1, duration: 900, easing: Easing.linear, useNativeDriver: true }),
        Animated.timing(fade, { toValue: 0.35, duration: 900, easing: Easing.linear, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [fade]);

  return (
    <Row
      style={{
        backgroundColor: colors.primarySoft,
        paddingVertical: 10,
        paddingHorizontal: 14,
        justifyContent: 'center',
      }}
    >
      <Animated.View style={{ opacity: fade }}>
        <Feather name="alert-circle" size={16} color={colors.primary} />
      </Animated.View>
      <Txt size={15} weight="700" color={colors.primary} style={{ marginHorizontal: 12 }} numberOfLines={1}>
        {text}
      </Txt>
      <Animated.View style={{ opacity: fade }}>
        <Feather name="alert-circle" size={16} color={colors.primary} />
      </Animated.View>
    </Row>
  );
}

export function MenuItem({
  icon,
  title,
  subtitle,
  onPress,
  iconSet = 'feather',
}: {
  icon: string;
  title: string;
  subtitle?: string;
  onPress: () => void;
  iconSet?: 'feather' | 'ion' | 'mci';
}) {
  const { colors } = useTheme();
  const Icon =
    iconSet === 'ion' ? Ionicons : iconSet === 'mci' ? MaterialCommunityIcons : Feather;
  return (
    <Card onPress={onPress} style={{ paddingVertical: 16 }}>
      <Row>
        <View
          style={{
            width: 44,
            height: 44,
            borderRadius: radius.md,
            backgroundColor: colors.primarySoft,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          {/* @ts-expect-error icon families share a name prop but not a union type */}
          <Icon name={icon} size={22} color={colors.primary} />
        </View>
        <View style={{ flex: 1, marginLeft: 14 }}>
          <Txt size={16} weight="700">
            {title}
          </Txt>
          {subtitle ? (
            <Txt size={12.5} color={colors.textMuted} style={{ marginTop: 2 }}>
              {subtitle}
            </Txt>
          ) : null}
        </View>
        <Feather name="chevron-right" size={22} color={colors.primary} />
      </Row>
    </Card>
  );
}

export function PlayButton({ onPress, size = 56 }: { onPress: () => void; size?: number }) {
  const { colors } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => ({
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: colors.primary,
        alignItems: 'center',
        justifyContent: 'center',
        opacity: pressed ? 0.85 : 1,
      })}
    >
      <Ionicons name="play" size={size * 0.42} color="#FFFFFF" style={{ marginLeft: 3 }} />
    </Pressable>
  );
}

export function Loader() {
  const { colors } = useTheme();
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.bgAlt }}>
      <ActivityIndicator size="large" color={colors.primary} />
    </View>
  );
}

export function EmptyState({ icon = 'inbox', text }: { icon?: keyof typeof Feather.glyphMap; text: string }) {
  const { colors } = useTheme();
  return (
    <View style={{ alignItems: 'center', paddingVertical: 60 }}>
      <Feather name={icon} size={44} color={colors.border} />
      <Txt size={14} color={colors.textMuted} style={{ marginTop: 12, textAlign: 'center' }}>
        {text}
      </Txt>
    </View>
  );
}

export function Pill({ text, tone = 'muted' }: { text: string; tone?: 'muted' | 'success' | 'danger' | 'primary' }) {
  const { colors } = useTheme();
  const map = {
    muted: { bg: colors.bgAlt, fg: colors.textMuted },
    success: { bg: colors.success + '22', fg: colors.success },
    danger: { bg: colors.danger + '22', fg: colors.danger },
    primary: { bg: colors.primarySoft, fg: colors.primary },
  }[tone];
  return (
    <View style={{ backgroundColor: map.bg, paddingHorizontal: 10, paddingVertical: 4, borderRadius: radius.pill }}>
      <Txt size={11.5} weight="700" color={map.fg}>
        {text}
      </Txt>
    </View>
  );
}

/** Bottom-anchored pagination bar used by the passbook / history screens. */
export function Pager({
  page,
  totalPages,
  onPrev,
  onNext,
}: {
  page: number;
  totalPages: number;
  onPrev: () => void;
  onNext: () => void;
}) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const btn = (label: string, onPress: () => void, disabled: boolean, flex: number) => (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={{
        flex,
        backgroundColor: disabled ? colors.primary + '66' : colors.primary,
        paddingVertical: 14,
        borderRadius: radius.md,
        alignItems: 'center',
      }}
    >
      <Txt size={14} weight="800" color="#FFFFFF">
        {label}
      </Txt>
    </Pressable>
  );
  return (
    <Row
      style={{
        gap: 10,
        padding: 12,
        paddingBottom: 12 + Math.min(insets.bottom, 8),
        backgroundColor: colors.bgAlt,
      }}
    >
      {btn('PREVIOUS', onPrev, page <= 1, 1)}
      {btn(`(${page}/${totalPages})`, () => {}, false, 0.8)}
      {btn('NEXT', onNext, page >= totalPages, 1)}
    </Row>
  );
}

export const shared = StyleSheet.create({
  tableHeadCell: { flex: 1, paddingVertical: 14, paddingHorizontal: 12 },
});

export function tableHeaderStyle(colors: Palette): ViewStyle {
  return {
    flexDirection: 'row',
    backgroundColor: colors.primarySoft,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  };
}
