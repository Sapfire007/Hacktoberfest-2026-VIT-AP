/**
 * One regular pass: its QR (to show or print), schedule, holder, and — behind a button,
 * audited — the ID photo. Admin can revoke it; a holder inside when it is revoked can still
 * be scanned out.
 */

import React, { useState } from 'react';
import { Image, StyleSheet } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { Colors } from '@/constants/colors';
import { Radius } from '@/constants/neumorphic';
import { NeuButton } from '@/components/ui/NeuButton';
import { RegularPassView } from '@/components/gate/RegularPassView';
import { useAuth } from '@/context/AuthContext';
import { adminAPI, firstError } from '@/services/admin.api';
import { useAdminData } from '@/components/admin/useAdminData';
import { AdminPage, Card, ErrorText, Loading, Muted, ReasonModal } from '@/components/admin/AdminKit';

export default function AdminRegularPassScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { getIdToken } = useAuth();
  const { data, setData, loading, error, reload } = useAdminData((t) => adminAPI.recurring(t, id!), [id]);
  const [revoking, setRevoking] = useState(false);
  const [photo, setPhoto] = useState<string | null>(null);
  const [photoError, setPhotoError] = useState<string | null>(null);

  const pass = data?.pass;

  const showPhoto = async () => {
    setPhotoError(null);
    const result = await adminAPI.recurringIdPhoto(await getIdToken(), id!);
    if (!result.success || !result.data?.imageDataUri) {
      setPhotoError(firstError(result));
      return;
    }
    setPhoto(result.data.imageDataUri);
  };

  return (
    <AdminPage
      title={pass ? pass.holderName : 'Regular pass'}
      subtitle={pass ? `Pass ${pass.passCode}` : undefined}
      refreshing={loading && Boolean(data)}
      onRefresh={reload}
      actions={
        pass?.status === 'active' ? (
          <NeuButton title="Revoke pass" variant="danger" size="sm" onPress={() => setRevoking(true)} />
        ) : undefined
      }
    >
      <ErrorText>{error}</ErrorText>
      {!data && loading ? <Loading /> : null}

      {pass && data && (
        <>
          <RegularPassView
            pass={pass}
            passToken={data.passToken}
            onConfirmLink={async () => {
              const result = await adminAPI.linkRecurring(await getIdToken(), pass.id);
              if (!result.success) throw new Error(firstError(result));
              const label = result.data?.linkedAccountLabel ?? null;
              setData({ ...data, pass: { ...pass, linkedAccountLabel: label, suggestedAccountLabel: null } });
              return label;
            }}
          />

          <Card title="ID PHOTO">
            {photo ? (
              <Image source={{ uri: photo }} style={styles.photo} resizeMode="contain" />
            ) : pass.hasIdPhoto ? (
              <>
                <Muted>Viewing the ID photo is recorded in the audit log under your name.</Muted>
                <NeuButton title="View ID photo" variant="primary" size="sm" onPress={showPhoto} />
              </>
            ) : (
              <Muted>No photo was taken when this pass was issued.</Muted>
            )}
            <ErrorText>{photoError}</ErrorText>
          </Card>

          {pass.notes ? (
            <Card title="NOTES">
              <Muted>{pass.notes}</Muted>
            </Card>
          ) : null}
        </>
      )}

      <ReasonModal
        visible={revoking}
        title="Revoke this pass?"
        message="The QR stops admitting the holder at every gate. If they are inside now, they can still be scanned out. Recorded in the audit log."
        confirmLabel="Revoke"
        danger
        onCancel={() => setRevoking(false)}
        onConfirm={async (reason) => {
          const result = await adminAPI.revokeRecurring(await getIdToken(), id!, reason);
          if (!result.success) throw new Error(firstError(result));
          setRevoking(false);
          await reload();
        }}
      />
    </AdminPage>
  );
}

const styles = StyleSheet.create({
  photo: { width: '100%', height: 320, borderRadius: Radius.lg, backgroundColor: Colors.gray100 },
});
