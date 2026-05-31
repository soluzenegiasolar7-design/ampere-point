import { create } from 'zustand'

interface LocationData {
  latitude: number
  longitude: number
  accuracy?: number
  timestamp: string
}

interface LocationState {
  userLocations: Record<string, LocationData>
  updateLocation: (userId: string, data: LocationData) => void
}

export const useLocationStore = create<LocationState>((set) => ({
  userLocations: {},
  updateLocation: (userId, data) =>
    set((s) => ({ userLocations: { ...s.userLocations, [userId]: data } })),
}))
