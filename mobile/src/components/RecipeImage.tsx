import { useEffect, useState } from 'react';
import { Image, StyleSheet, View } from 'react-native';
import { AppIcon } from './AppIcon';
import { recipeImageLaidOutSize, recipeImageSource } from '../lib/recipeImages';
import { colors } from '../theme/colors';
import { radius } from '../theme/spacing';

type Props = {
  recipeId: string;
  name?: string | null;
  // home = compact dashboard, card = ideas list, detail = recipe page.
  size?: 'home' | 'card' | 'detail';
};

// Recipe image from the local image map, or an illustration when none exists.
// Hidden from screen readers because the title already names the dish.
export function RecipeImage({ recipeId, size = 'card' }: Props) {
  const source = recipeImageSource(recipeId);
  const dim = size === 'detail' ? styles.detail : size === 'home' ? styles.home : styles.card;
  const [failed, setFailed] = useState(false);
  const [box, setBox] = useState<{ width: number; height: number } | null>(null);

  useEffect(() => {
    setFailed(false);
  }, [source]);

  if (source == null || failed) {
    return (
      <View
        style={[dim, styles.placeholder]}
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
      >
        <View style={styles.placeholderMark}>
          <AppIcon
            name="restaurant-outline"
            size={size === 'detail' ? 28 : 22}
            color={colors.textSubtle}
          />
        </View>
      </View>
    );
  }

  const laidOut = box ? recipeImageLaidOutSize(box.width, box.height, recipeId) : null;

  return (
    <View
      style={[dim, styles.frame]}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      onLayout={(event) => {
        const { width, height } = event.nativeEvent.layout;
        setBox((prev) =>
          prev && prev.width === width && prev.height === height ? prev : { width, height },
        );
      }}
    >
      {laidOut ? (
        <Image
          key={String(source)}
          source={source}
          style={{ width: laidOut.width, height: laidOut.height }}
          resizeMode="cover"
          onError={() => setFailed(true)}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  home: {
    width: '100%',
    aspectRatio: 16 / 10,
    backgroundColor: colors.surfaceMuted,
    overflow: 'hidden',
  },
  card: {
    width: '100%',
    aspectRatio: 16 / 10,
    backgroundColor: colors.surfaceMuted,
    borderTopLeftRadius: radius.md,
    borderTopRightRadius: radius.md,
    overflow: 'hidden',
  },
  detail: {
    width: '100%',
    aspectRatio: 16 / 10,
    backgroundColor: colors.surfaceMuted,
    borderRadius: radius.md,
    overflow: 'hidden',
  },
  frame: {
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  placeholder: {
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  placeholderMark: {
    width: 44,
    height: 44,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
