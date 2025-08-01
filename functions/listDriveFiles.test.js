jest.mock('googleapis', () => {
  const listMock = jest.fn();
  const getMock = jest.fn();
  return {
    google: {
      auth: { GoogleAuth: jest.fn(() => ({ getClient: jest.fn() })) },
      drive: jest.fn(() => ({ files: { list: listMock, get: getMock } }))
    },
    __mocks: { listMock, getMock }
  };
});

const { listMock, getMock } = jest.requireMock('googleapis').__mocks;

import { listDriveFiles } from './listDriveFiles.js';

beforeEach(() => {
  listMock.mockReset();
  getMock.mockReset();
});

test('returns files in folder', async () => {
  getMock.mockResolvedValueOnce({ data: { id: 'folderid1234567890123456789', name: 'folder', mimeType: 'application/vnd.google-apps.folder' } });
  listMock.mockResolvedValueOnce({ data: { files: [{ id: 'file1', name: 'File', webContentLink: 'link1' }] } });
  const res = await listDriveFiles.run({ data: { driveFolderUrl: 'https://drive.google.com/drive/folders/folderid1234567890123456789', campaign: 'camp' } });
  expect(listMock).toHaveBeenCalled();
  expect(res.results).toEqual([{ name: 'File', url: 'link1', campaign: 'camp' }]);
});

test('returns single file for file link', async () => {
  getMock.mockResolvedValueOnce({ data: { id: 'fileid12345678901234567890', name: 'File', mimeType: 'image/png', webContentLink: 'linkfile' } });
  const res = await listDriveFiles.run({ data: { driveFolderUrl: 'https://drive.google.com/file/d/fileid12345678901234567890/view', campaign: 'camp' } });
  expect(listMock).not.toHaveBeenCalled();
  expect(res.results).toEqual([{ name: 'File', url: 'linkfile', campaign: 'camp' }]);
});
