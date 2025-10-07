const getOrderIndex = (card) => {
  if (card && typeof card.orderIndex === 'number' && !Number.isNaN(card.orderIndex)) {
    return card.orderIndex;
  }
  return null;
};

const getCreatedAtMillis = (value) => {
  if (!value) return null;
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  if (typeof value.toMillis === 'function') {
    try {
      return value.toMillis();
    } catch (err) {
      return null;
    }
  }
  if (typeof value.seconds === 'number') {
    const millis = value.seconds * 1000;
    if (typeof value.nanoseconds === 'number') {
      return millis + Math.floor(value.nanoseconds / 1e6);
    }
    return millis;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const getId = (card) => {
  if (!card) return '';
  const { id } = card;
  if (typeof id === 'string') return id;
  if (id == null) return '';
  return String(id);
};

export const sortCopyCards = (cards = []) => {
  if (!Array.isArray(cards) || cards.length === 0) {
    return Array.isArray(cards) ? [...cards] : [];
  }

  const withFallbacks = cards.filter((card) => card);

  withFallbacks.sort((a, b) => {
    const orderA = getOrderIndex(a);
    const orderB = getOrderIndex(b);
    if (orderA != null || orderB != null) {
      if (orderA == null) return 1;
      if (orderB == null) return -1;
      if (orderA !== orderB) return orderA - orderB;
    }

    const createdA = getCreatedAtMillis(a?.createdAt);
    const createdB = getCreatedAtMillis(b?.createdAt);
    if (createdA != null || createdB != null) {
      if (createdA == null) return 1;
      if (createdB == null) return -1;
      if (createdA !== createdB) return createdA - createdB;
    }

    const idA = getId(a);
    const idB = getId(b);
    if (idA || idB) {
      return idA.localeCompare(idB);
    }
    return 0;
  });

  return withFallbacks;
};

export default sortCopyCards;

