import { ImageResponse } from 'next/og';

export const alt = 'Mobility Database';
export const size = {
  width: 1200,
  height: 630,
};
export const contentType = 'image/png';

export default function Image(): ImageResponse {
  return new ImageResponse(
    (
      <div
        style={{
          background: 'linear-gradient(to bottom right, #003366, #001a33)',
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          color: '#ffffff',
          fontFamily: 'sans-serif',
          padding: 48,
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            marginBottom: 24,
          }}
        >
          <div style={{ fontSize: 72, fontWeight: 800, color: '#38bdf8' }}>
            Mobility
          </div>
          <div
            style={{
              fontSize: 72,
              fontWeight: 800,
              color: '#ffffff',
              marginLeft: 16,
            }}
          >
            Database
          </div>
        </div>
        <div
          style={{
            fontSize: 32,
            color: '#cbd5e1',
            textAlign: 'center',
            maxWidth: 900,
            lineHeight: 1.4,
          }}
        >
          Global Catalog of GTFS, GTFS-Realtime &amp; GBFS Feeds
        </div>
        <div
          style={{
            marginTop: 48,
            fontSize: 20,
            color: '#64748b',
          }}
        >
          mobilitydatabase.org
        </div>
      </div>
    ),
    {
      ...size,
    },
  );
}
