import { ImageResponse } from 'next/og';

export const alt = 'Mobility Database Feed Details';
export const size = {
  width: 1200,
  height: 630,
};
export const contentType = 'image/png';

interface Props {
  params: Promise<{
    feedDataType: string;
    feedId: string;
  }>;
}

export default async function Image({ params }: Props): Promise<ImageResponse> {
  const { feedDataType, feedId } = await params;
  const typeLabel = (feedDataType ?? 'FEED').toUpperCase().replace('_', '-');

  return new ImageResponse(
    (
      <div
        style={{
          background: 'linear-gradient(to bottom right, #0f172a, #1e293b)',
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          color: '#ffffff',
          fontFamily: 'sans-serif',
          padding: 60,
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center' }}>
            <span style={{ fontSize: 40, fontWeight: 800, color: '#38bdf8' }}>
              Mobility
            </span>
            <span
              style={{
                fontSize: 40,
                fontWeight: 800,
                color: '#ffffff',
                marginLeft: 10,
              }}
            >
              Database
            </span>
          </div>
          <div
            style={{
              backgroundColor: '#0284c7',
              color: '#ffffff',
              padding: '10px 24px',
              borderRadius: 9999,
              fontSize: 24,
              fontWeight: 700,
            }}
          >
            {typeLabel}
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <div
            style={{
              fontSize: 56,
              fontWeight: 800,
              color: '#ffffff',
              marginBottom: 16,
            }}
          >
            Feed {feedId}
          </div>
          <div style={{ fontSize: 26, color: '#94a3b8', lineHeight: 1.5 }}>
            Public transit feed details, service metrics, and quality reports
          </div>
        </div>

        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            borderTop: '1px solid #334155',
            paddingTop: 24,
          }}
        >
          <span style={{ fontSize: 22, color: '#64748b' }}>
            mobilitydatabase.org
          </span>
        </div>
      </div>
    ),
    {
      ...size,
    },
  );
}
