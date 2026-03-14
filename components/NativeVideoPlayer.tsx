import React from 'react';
import { View, StyleSheet, ActivityIndicator } from 'react-native';
import { useVideoPlayer, VideoView } from 'expo-video';

interface NativeVideoPlayerProps {
  url: string;
}

export const NativeVideoPlayer = ({ url }: NativeVideoPlayerProps) => {
  const player = useVideoPlayer(url, (player) => {
    player.loop = true;
    player.muted = false;
  });

  return (
    <View style={styles.contentContainer}>
      <VideoView
        style={styles.video}
        player={player}
        allowsFullscreen
        allowsPictureInPicture
        startsPictureInPictureAutomatically
      />
    </View>
  );
};

const styles = StyleSheet.create({
  contentContainer: {
    width: '100%',
    aspectRatio: 16 / 9,
    backgroundColor: '#000',
    borderRadius: 12,
    overflow: 'hidden',
    marginVertical: 8,
  },
  video: {
    width: '100%',
    height: '100%',
  },
});
