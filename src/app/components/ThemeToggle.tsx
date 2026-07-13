import { IconButton } from '@mui/material';
import Brightness4Icon from '@mui/icons-material/Brightness4';
import Brightness7Icon from '@mui/icons-material/Brightness7';
import { useTheme } from '../context/ThemeProvider';
import { ThemeModeEnum } from '../Theme';

const ThemeToggle = (): React.ReactElement => {
  const { mode, toggleTheme } = useTheme();

  return (
    <IconButton onClick={toggleTheme} color='inherit' aria-label='Theme Toggle'>
      {mode === ThemeModeEnum.dark ? <Brightness7Icon /> : <Brightness4Icon />}
    </IconButton>
  );
};

export default ThemeToggle;
