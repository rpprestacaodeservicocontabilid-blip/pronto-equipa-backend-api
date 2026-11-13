/**
 * Format Utilities
 * Funções para formatar dados
 */

/**
 * Formata números como moeda (Kz - Kwanza)
 */
export function formatCurrency(value: number, currency: string = 'KZ'): string {
  return new Intl.NumberFormat('pt-AO', {
    style: 'currency',
    currency: currency === 'KZ' ? 'AOA' : currency,
  }).format(value);
}

/**
 * Formata datas no padrão pt-AO
 */
export function formatDate(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  return d.toLocaleDateString('pt-AO', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
}

/**
 * Formata data e hora
 */
export function formatDateTime(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  return d.toLocaleString('pt-AO', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

/**
 * Calcula idade baseado em data de nascimento
 */
export function calculateAge(birthDate: Date | string): number {
  const birth = typeof birthDate === 'string' ? new Date(birthDate) : birthDate;
  const today = new Date();
  let age = today.getFullYear() - birth.getFullYear();
  const monthDiff = today.getMonth() - birth.getMonth();

  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birth.getDate())) {
    age--;
  }

  return age;
}

/**
 * Valida e normaliza email
 */
export function normalizeEmail(email: string): string {
  return email.toLowerCase().trim();
}

/**
 * Valida e normaliza telefone
 */
export function normalizePhone(phone: string): string {
  return phone.replace(/\D/g, '');
}

/**
 * Valida email (RFC 5322 simplificado)
 */
export function isValidEmail(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

/**
 * Remove caracteres especiais
 */
export function removeSpecialChars(text: string): string {
  return text.replace(/[^a-zA-Z0-9]/g, '');
}

/**
 * Trunca texto com reticências
 */
export function truncateText(text: string, maxLength: number = 50): string {
  if (text.length <= maxLength) return text;
  return text.substring(0, maxLength) + '...';
}

/**
 * Capitaliza primeira letra
 */
export function capitalize(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1).toLowerCase();
}

/**
 * Capitaliza cada palavra
 */
export function titleCase(text: string): string {
  return text
    .split(' ')
    .map((word) => capitalize(word))
    .join(' ');
}
