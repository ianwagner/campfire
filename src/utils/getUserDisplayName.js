const getUserDisplayName = (user) => {
  if (!user) return '';
  const name = typeof user.name === 'string' ? user.name.trim() : '';
  if (name) return name;
  const displayName = typeof user.displayName === 'string' ? user.displayName.trim() : '';
  if (displayName) return displayName;
  const email = typeof user.email === 'string' ? user.email.trim() : '';
  if (email) return email;
  const phoneNumber = typeof user.phoneNumber === 'string' ? user.phoneNumber.trim() : '';
  if (phoneNumber) return phoneNumber;
  return user.id || '';
};

export default getUserDisplayName;
