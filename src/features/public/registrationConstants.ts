export const REGISTRATION_STATUS = {
  REGISTERED: 'registered',
  ATTENDED: 'attended',
  COMPLETED: 'completed',
  INACTIVE: 'inactive',
  CANCELLED: 'cancelled',
} as const

export type RegistrationStatus =
  (typeof REGISTRATION_STATUS)[keyof typeof REGISTRATION_STATUS]

export const STATUS_PILL_STYLES: Record<RegistrationStatus, string> = {
  [REGISTRATION_STATUS.REGISTERED]: 'bg-green-100 text-green-700',
  [REGISTRATION_STATUS.ATTENDED]: 'bg-blue-100 text-blue-700',
  [REGISTRATION_STATUS.COMPLETED]: 'bg-teal-100 text-teal-700',
  [REGISTRATION_STATUS.INACTIVE]: 'bg-gray-100 text-gray-600',
  [REGISTRATION_STATUS.CANCELLED]: 'bg-red-100 text-red-700',
}

export const STATUS_PILL_FALLBACK = 'bg-gray-100 text-gray-600'

export const DISPLAY_LOCALE = 'en-PH'

export const DATE_FORMAT: Intl.DateTimeFormatOptions = {
  month: 'short',
  day: 'numeric',
  year: 'numeric',
}

export const DATE_TIME_FORMAT: Intl.DateTimeFormatOptions = {
  ...DATE_FORMAT,
  hour: 'numeric',
  minute: '2-digit',
}

export const CANCELLATION_REASON_MAX_LENGTH =
  Number(import.meta.env.VITE_CANCELLATION_REASON_MAX_LENGTH) || 300

export const CANCELLATION_ERROR = {
  NOT_FOUND: 'REGISTRATION_NOT_FOUND',
  NOT_OWNER: 'NOT_OWNER',
  NOT_CANCELLABLE: 'NOT_CANCELLABLE',
  CUTOFF_PASSED: 'CUTOFF_PASSED',
} as const

export const CANCELLATION_ERROR_MESSAGES: Record<string, string> = {
  [CANCELLATION_ERROR.NOT_FOUND]: 'This registration could not be found.',
  [CANCELLATION_ERROR.NOT_OWNER]: 'You can only cancel your own registration.',
  [CANCELLATION_ERROR.NOT_CANCELLABLE]: 'This registration can no longer be cancelled.',
  [CANCELLATION_ERROR.CUTOFF_PASSED]: 'The cancellation deadline for this activity has passed.',
}

export const CANCELLATION_FALLBACK_MESSAGE =
  'Something went wrong while cancelling. Please try again.'
