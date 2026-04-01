'use client';

import {
  Box,
  Chip,
  Paper,
  Typography,
  useTheme,
  Alert,
} from '@mui/material';
import {
  CheckCircle,
  CloudUpload,
  RadioButtonUnchecked,
} from '@mui/icons-material';
import React, { useCallback } from 'react';
import { CORE_GTFS_FILES, type CoreGtfsFile } from '../lib/gtfs-types';

interface UploadZoneProps {
  label: string;
  fileNames: string[];
  onFilesSelected: (files: File[]) => void;
  disabled?: boolean;
  /** Accept .zip files in addition to .txt */
  acceptZip?: boolean;
}

export default function UploadZone({
  label,
  fileNames,
  onFilesSelected,
  disabled = false,
  acceptZip = true,
}: UploadZoneProps): React.ReactElement {
  const theme = useTheme();

  const acceptExts = acceptZip ? ['.txt', '.zip', '.gtfs'] : ['.txt'];
  const acceptAttr = acceptExts.join(',');

  const isAcceptedFile = useCallback(
    (file: File): boolean => {
      const name = file.name.toLowerCase();
      return (acceptZip ? ['.txt', '.zip', '.gtfs'] : ['.txt']).some((ext) =>
        name.endsWith(ext),
      );
    },
    [acceptZip],
  );

  const handleDrop = useCallback(
    (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      e.stopPropagation();
      if (disabled) return;
      const files = Array.from(e.dataTransfer.files).filter(isAcceptedFile);
      if (files.length > 0) onFilesSelected(files);
    },
    [onFilesSelected, disabled, isAcceptedFile],
  );

  const handleDragOver = useCallback(
    (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      e.stopPropagation();
    },
    [],
  );

  const handleFileInput = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = Array.from(e.target.files ?? []).filter(isAcceptedFile);
      if (files.length > 0) onFilesSelected(files);
      e.target.value = '';
    },
    [onFilesSelected, isAcceptedFile],
  );

  const presentFiles = new Set(fileNames.map((f) => f.toLowerCase()));

  return (
    <Paper
      variant='outlined'
      onDrop={handleDrop}
      onDragOver={handleDragOver}
      sx={{
        p: 3,
        flex: 1,
        minWidth: 300,
        opacity: disabled ? 0.6 : 1,
        border: '2px dashed',
        borderColor: theme.palette.divider,
        cursor: disabled ? 'not-allowed' : 'pointer',
        transition: 'border-color 0.2s',
        '&:hover': disabled
          ? {}
          : { borderColor: theme.palette.primary.main },
      }}
    >
      <Box
        component='label'
        sx={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 1,
          cursor: disabled ? 'not-allowed' : 'pointer',
        }}
      >
        <input
          type='file'
          multiple
          accept={acceptAttr}
          onChange={handleFileInput}
          disabled={disabled}
          style={{ display: 'none' }}
        />
        <CloudUpload
          sx={{ fontSize: 40, color: theme.palette.text.secondary }}
        />
        <Typography variant='h6' fontWeight={700}>
          {label}
        </Typography>
        <Typography variant='body2' color='text.secondary'>
          Drop a GTFS .zip or individual .txt files here
        </Typography>
      </Box>

      {fileNames.length > 0 && (
        <Box sx={{ mt: 2, display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
          {fileNames.map((f) => (
            <Chip
              key={f}
              label={f}
              size='small'
              color='primary'
              variant='outlined'
            />
          ))}
        </Box>
      )}

      <Box sx={{ mt: 2 }}>
        <Typography
          variant='caption'
          color='text.secondary'
          sx={{ mb: 0.5, display: 'block' }}
        >
          Core files:
        </Typography>
        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
          {CORE_GTFS_FILES.map((file: CoreGtfsFile) => {
            const present = presentFiles.has(file);
            return (
              <Chip
                key={file}
                label={file}
                size='small'
                icon={
                  present ? (
                    <CheckCircle fontSize='small' />
                  ) : (
                    <RadioButtonUnchecked fontSize='small' />
                  )
                }
                color={present ? 'success' : 'default'}
                variant={present ? 'filled' : 'outlined'}
                sx={{ fontSize: '0.7rem' }}
              />
            );
          })}
        </Box>
      </Box>
    </Paper>
  );
}
