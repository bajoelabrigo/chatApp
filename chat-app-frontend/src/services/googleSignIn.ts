import {
  GoogleSignin,
  isErrorWithCode,
  statusCodes,
} from '@react-native-google-signin/google-signin';

GoogleSignin.configure({
  webClientId: process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID,
  offlineAccess: true,
});

export async function getGoogleIdToken(): Promise<string> {
  await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });
  const response = await GoogleSignin.signIn();

  if (!response.data?.idToken) {
    throw new Error('No se obtuvo el idToken de Google');
  }
  return response.data.idToken;
}

export async function signOutGoogle(): Promise<void> {
  await GoogleSignin.signOut();
}

export { isErrorWithCode, statusCodes };
