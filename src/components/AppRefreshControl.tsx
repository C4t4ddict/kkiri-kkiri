import React from 'react';
import { RefreshControl, RefreshControlProps } from 'react-native';
import colors from '../config/colors';

export default function AppRefreshControl(props: RefreshControlProps) {
  return (
    <RefreshControl
      colors={[colors.primary]}
      tintColor={colors.primary}
      progressBackgroundColor="#FFFFFF"
      progressViewOffset={12}
      {...props}
    />
  );
}
