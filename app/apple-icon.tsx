import { ImageResponse } from 'next/og';

/** Иконка для ярлыка на домашнем экране iOS. */
export const size = { width: 180, height: 180 };
export const contentType = 'image/png';

export default function AppleIcon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'linear-gradient(135deg, #0f766e 0%, #115e59 100%)',
          color: 'white',
          fontSize: 84,
          fontWeight: 700,
          letterSpacing: -2,
        }}
      >
        ООО
        <div style={{ fontSize: 24, fontWeight: 400, opacity: 0.85, marginTop: 4 }}>база</div>
      </div>
    ),
    size,
  );
}
