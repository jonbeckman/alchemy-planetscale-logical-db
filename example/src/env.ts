export const AppDbMode = {
  local: "local",
  remote: "remote",
} as const

export type AppDbMode = (typeof AppDbMode)[keyof typeof AppDbMode]

export function requiredEnv(name: string): string {
  const value = process.env[name]

  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`)
  }

  return value
}

export function appDbModeFromEnv(): AppDbMode {
  const value = requiredEnv("APP_DB_MODE")

  if (value === AppDbMode.local || value === AppDbMode.remote) {
    return value
  }

  throw new Error(`Invalid APP_DB_MODE "${value}". Expected "local" or "remote".`)
}
