/**
 * Change or remove a profile picture / channel logo: a themed dialog with
 * "Choose from gallery" (asks for gallery permission) and "Remove".
 */

import { Linking } from 'react-native';
import { AppAlert } from '../components/AppAlert';
import { ApiError, errorMessage } from '../api/client';
import { PickedFile } from '../api/upload';
import { PermissionDenied, pickProfileImage } from './pickers';

type Tx = (bn: string, en: string) => string;

export function changePicture(options: {
  tx: Tx;
  title: string;
  hasPicture: boolean;
  upload: (file: PickedFile) => Promise<void>;
  remove: () => Promise<void>;
  setBusy?: (busy: boolean) => void;
}) {
  const { tx, title, hasPicture, upload, remove, setBusy } = options;
  const run = async (action: () => Promise<void>) => {
    setBusy?.(true);
    try {
      await action();
    } catch (error) {
      if (error instanceof PermissionDenied) {
        AppAlert.alert(
          tx('গ্যালারির অনুমতি দরকার', 'Gallery access needed'),
          tx(
            'ছবি বেছে নিতে BornoVerse-কে ফোনের ছবি দেখার অনুমতি দিন।',
            'Allow BornoVerse to access your photos to choose a picture.',
          ),
          error.canAskAgain
            ? [{ text: tx('ঠিক আছে', 'OK') }]
            : [
                { text: tx('বাতিল', 'Cancel'), style: 'cancel' },
                { text: tx('সেটিংস খুলুন', 'Open settings'), onPress: () => Linking.openSettings() },
              ],
        );
      } else {
        const notOnServer = error instanceof ApiError && error.status === 404;
        AppAlert.alert(
          tx('ছবি বদলানো যায়নি', 'Could not change the picture'),
          notOnServer
            ? tx('সার্ভারে এই সুবিধা এখনো চালু হয়নি। পরে আবার চেষ্টা করুন।', 'This feature is not available on the server yet. Please try again later.')
            : errorMessage(error),
        );
      }
    } finally {
      setBusy?.(false);
    }
  };
  const choose = () =>
    run(async () => {
      const file = await pickProfileImage();
      if (file) await upload(file);
    });
  if (!hasPicture) {
    choose();
    return;
  }
  AppAlert.alert(title, undefined, [
    { text: tx('গ্যালারি থেকে বেছে নিন', 'Choose from gallery'), onPress: choose },
    { text: tx('ছবি সরান', 'Remove picture'), style: 'destructive', onPress: () => run(remove) },
    { text: tx('বাতিল', 'Cancel'), style: 'cancel' },
  ]);
}
