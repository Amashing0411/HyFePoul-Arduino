import React, { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Image, StyleProp, ImageStyle } from 'react-native';

// PIP's clips, pre-rendered from HyFePoul_Mascot/Models/PIP.glb as transparent animated WebP (360 × 414, 30 fps).
// Android needs expo.webp.animated=true in android/gradle.properties to play them.
const CLIPS = {
  Loco_Idle: { src: require('../../assets/pip/Loco_Idle.webp'), frames: 120, loop: true },
  Web_Appear: { src: require('../../assets/pip/Web_Appear.webp'), frames: 46, loop: false },
  Pers_Wave: { src: require('../../assets/pip/Pers_Wave.webp'), frames: 61, loop: false },
  Pers_HappyJump: { src: require('../../assets/pip/Pers_HappyJump.webp'), frames: 43, loop: false },
  Pers_Celebrate: { src: require('../../assets/pip/Pers_Celebrate.webp'), frames: 76, loop: false },
  Web_LowWater: { src: require('../../assets/pip/Web_LowWater.webp'), frames: 91, loop: false },
  Web_LowFeed: { src: require('../../assets/pip/Web_LowFeed.webp'), frames: 91, loop: false },
  Web_FeedingComplete: { src: require('../../assets/pip/Web_FeedingComplete.webp'), frames: 76, loop: false },
  Web_DeviceDisconnected: { src: require('../../assets/pip/Web_DeviceDisconnected.webp'), frames: 91, loop: false },
} as const;
const STILL = require('../../assets/pip/still.png');
const FPS = 30;

export type PipClip = keyof typeof CLIPS;

type Props = {
  /** The clip to play. One-shot clips play once, then PIP returns to Loco_Idle. */
  clip: PipClip;
  /** Changing this replays the same clip (for example on a second tap). */
  playKey?: number;
  size?: number;
  style?: StyleProp<ImageStyle>;
  onDone?: () => void;
};

export function useReduceMotion() {
  const [reduce, setReduce] = useState(false);
  useEffect(() => {
    AccessibilityInfo.isReduceMotionEnabled().then(setReduce);
    const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduce);
    return () => sub.remove();
  }, []);
  return reduce;
}

export default function Pip({ clip, playKey = 0, size = 120, style, onDone }: Props) {
  const reduce = useReduceMotion();
  const [shown, setShown] = useState<PipClip>(clip);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setShown(clip);
    if (timer.current) clearTimeout(timer.current);
    const c = CLIPS[clip];
    if (!c.loop) {
      timer.current = setTimeout(() => {
        setShown('Loco_Idle');
        onDone?.();
      }, (c.frames / FPS) * 1000);
    }
    return () => { if (timer.current) clearTimeout(timer.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clip, playKey]);

  const height = size * (414 / 360);
  return (
    <Image
      // A new key restarts the animation from its first frame.
      key={`${shown}-${playKey}`}
      source={reduce ? STILL : CLIPS[shown].src}
      style={[{ width: size, height }, style]}
      resizeMode="contain"
      accessibilityIgnoresInvertColors
      accessible={false}
    />
  );
}
