import { useEffect, useState } from 'react';
import { pointInPolygon } from '../../engine/geometry';
import { playerState } from '../../input/playerState';
import type { ApartmentLayout } from '../../layout/types';

/** Mostra o nome do ambiente em que o visitante está. */
export function RoomIndicator({ layout }: { layout: ApartmentLayout }) {
  const [name, setName] = useState<string | null>(null);
  useEffect(() => {
    const id = window.setInterval(() => {
      const room = layout.rooms.find((r) => pointInPolygon(playerState.position, r.polygon));
      setName(room?.name ?? null);
    }, 250);
    return () => window.clearInterval(id);
  }, [layout]);
  if (!name) return null;
  return (
    <div className="room-indicator" key={name}>
      {name}
    </div>
  );
}
