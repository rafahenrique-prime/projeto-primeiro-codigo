export default function Avatar({
  picture,
  initials = '?',
  color = '#9CA3AF',
  size = 44,
  isActive = false,
  activeColor = '#E8192C',
  ringColor = null,
  ringProgress = 0,
  badge = null,
  badgeSize = 16,
  innerSize = null,
  fallbackSize = 13,
}) {
  const innerDim = innerSize || Math.round(size * 0.86)
  const showRing = ringColor && ringProgress > 0

  return (
    <div style={{ position: 'relative', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      {/* Avatar Circle */}
      <div
        style={{
          width: size,
          height: size,
          borderRadius: '50%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          ...(showRing ? {
            background: `conic-gradient(${ringColor} ${ringProgress * 3.6}deg, #E5E7EB ${ringProgress * 3.6}deg)`,
            transition: 'background 0.5s ease',
          } : {}),
          border: isActive ? `2px solid ${activeColor}` : '2px solid transparent',
          transition: 'border 0.15s',
        }}
      >
        {/* Image or Initials */}
        {picture ? (
          <img
            src={picture}
            alt=""
            style={{
              width: innerDim,
              height: innerDim,
              borderRadius: '50%',
              objectFit: 'cover',
            }}
            onError={e => e.target.style.display = 'none'}
          />
        ) : (
          <div
            style={{
              width: innerDim,
              height: innerDim,
              borderRadius: '50%',
              background: color,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: fallbackSize,
              fontWeight: 600,
              color: '#fff',
            }}
          >
            {initials}
          </div>
        )}
      </div>

      {/* Badge */}
      {badge && (
        <div
          style={{
            position: 'absolute',
            bottom: -1,
            right: -1,
            width: badgeSize,
            height: badgeSize,
            borderRadius: '50%',
            background: badge.background,
            border: `2px solid #fff`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
          }}
        >
          {badge.icon}
        </div>
      )}
    </div>
  )
}
