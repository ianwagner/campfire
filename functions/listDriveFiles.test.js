const mocks = {
  listMock: jest.fn(),
  getMock: jest.fn(),
  getClientMock: jest.fn(),
};

jest.mock('googleapis', () => {
  return {
    google: {
      auth: { GoogleAuth: jest.fn(() => ({ getClient: mocks.getClientMock })) },
      drive: jest.fn(() => ({ files: { list: mocks.listMock, get: mocks.getMock } })),
    },
  };
});

const { listDriveFiles, extractFileId } = require('./listDriveFiles.js');

afterEach(() => {
  jest.clearAllMocks();
});

test('lists files when folder url provided', async () => {
  const folderId = 'aaaaaaaaaaaaaaaaaaaaaaaaa';
  mocks.getClientMock.mockResolvedValue({});
  mocks.getMock.mockResolvedValue({ data: { id: folderId, name: 'folder', mimeType: 'application/vnd.google-apps.folder', webContentLink: 'folderLink' } });
  mocks.listMock.mockResolvedValue({ data: { files: [
    { id: '1', name: 'f1', webContentLink: 'u1' },
    { id: '2', name: 'f2', webContentLink: 'u2' },
  ] } });
  const res = await listDriveFiles.run({ data: { driveFolderUrl: `https://drive.google.com/drive/folders/${folderId}`, campaign: 'Camp' } });
  expect(mocks.getMock).toHaveBeenCalledWith({
    fileId: folderId,
    fields: 'id,name,mimeType,webContentLink',
    supportsAllDrives: true,
  });
  expect(mocks.listMock).toHaveBeenCalledWith({
    q: `'${folderId}' in parents and trashed=false`,
    fields: 'files(id,name,webContentLink)',
    supportsAllDrives: true,
    includeItemsFromAllDrives: true,
    corpora: 'allDrives',
  });
  expect(res.results).toEqual([
    { name: 'f1', url: 'u1', campaign: 'Camp' },
    { name: 'f2', url: 'u2', campaign: 'Camp' },
  ]);
});

test('returns single file when file url provided', async () => {
  const fileId = 'bbbbbbbbbbbbbbbbbbbbbbbbb';
  mocks.getClientMock.mockResolvedValue({});
  mocks.getMock.mockResolvedValue({ data: { id: fileId, name: 'img.png', mimeType: 'image/png', webContentLink: 'fileLink' } });
  const res = await listDriveFiles.run({ data: { driveFolderUrl: `https://drive.google.com/file/d/${fileId}/view`, campaign: 'Camp' } });
  expect(mocks.getMock).toHaveBeenCalledWith({
    fileId,
    fields: 'id,name,mimeType,webContentLink',
    supportsAllDrives: true,
  });
  expect(mocks.listMock).not.toHaveBeenCalled();
  expect(res.results).toEqual([{ name: 'img.png', url: 'fileLink', campaign: 'Camp' }]);
});

test('extractFileId handles url fragments', () => {
  const folderId = 'ccccccccccccccccccccccccc';
  const url = `https://drive.google.com/drive/folders/${folderId}#folder=0`;
  expect(extractFileId(url)).toBe(folderId);
});
