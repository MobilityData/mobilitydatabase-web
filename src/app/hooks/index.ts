import {
  type TypedUseSelectorHook,
  useDispatch,
  useSelector,
} from 'react-redux';
import { type RootState, type AppDispatch } from '../store/store';

// Use throughout your app instead of plain `useDispatch` and `useSelector`
export const useAppDispatch = (): AppDispatch => useDispatch<AppDispatch>();
export const useAppSelector: TypedUseSelectorHook<RootState> = useSelector;

// Hook to check if redux-persist has finished rehydrating the store
// This allows us to display content before the store is fully rehydrated while giving us a way to check rehydration status if needed (e.g. to delay rendering of certain components until rehydration is complete)
export const useRehydrated = (): boolean => {
  return useAppSelector((state) => {
    // Redux-persist adds a _persist key to the state with rehydrated status
    return state?._persist?.rehydrated ?? false;
  });
};
