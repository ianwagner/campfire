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

const { verifyDriveAccess } = require('./verifyDriveAccess.js');

afterEach(() => {
  jest.clearAllMocks();
});

test('verifies access when drive returns a file', async () => {
  const folderId = 'folderid123';
  mocks.getClientMock.mockResolvedValue({});
  // First get: fetch folder metadata
  mocks.getMock.mockResolvedValueOnce({ data: { id: folderId, mimeType: 'application/vnd.google-apps.folder' } });
  // list returns first file
  mocks.listMock.mockResolvedValue({ data: { files: [{ id: 'file1' }] } });
  // Second get: fetch file metadata
  mocks.getMock.mockResolvedValueOnce({ data: { id: 'file1', mimeType: 'image/png' } });

  const res = await verifyDriveAccess.run({ data: { url: `https://drive.google.com/drive/folders/${folderId}` } });

  expect(mocks.getMock).toHaveBeenNthCalledWith(1, {
    fileId: folderId,
    fields: 'id,name,mimeType',
    supportsAllDrives: true,
  });
  expect(mocks.listMock).toHaveBeenCalledWith({
    q: `'${folderId}' in parents and trashed=false`,
    pageSize: 1,
    fields: 'files(id)',
    supportsAllDrives: true,
    includeItemsFromAllDrives: true,
    corpora: 'allDrives',
  });
  expect(mocks.getMock).toHaveBeenNthCalledWith(2, { fileId: 'file1', fields: 'id', supportsAllDrives: true });
  expect(res).toEqual({ success: true });
});

test('throws when drive api rejects', async () => {
  const fileId = 'file123';
  mocks.getClientMock.mockResolvedValue({});
  mocks.getMock.mockRejectedValue(new Error('no access'));

  await expect(
    verifyDriveAccess.run({ data: { url: `https://drive.google.com/file/d/${fileId}/view` } })
  ).rejects.toThrow('no access');
});
