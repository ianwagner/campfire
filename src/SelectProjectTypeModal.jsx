import React from 'react';
import Modal from './components/Modal.jsx';
import { FiFileText } from 'react-icons/fi';
import { FilePlus } from 'lucide-react';

const OptionButton = ({ icon: Icon, title, desc, onClick }) => (
  <button
    className="border rounded-xl p-4 text-left hover:bg-gray-100 flex flex-col items-start"
    onClick={onClick}
  >
    <div className="text-2xl mb-2"><Icon /></div>
    <span className="font-semibold mb-1">{title}</span>
    <p className="text-sm text-gray-600">{desc}</p>
  </button>
);

const SelectProjectTypeModal = ({ onSelect, onClose }) => (
  <Modal>
    <h2 className="text-xl font-semibold mb-4">New Project</h2>
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
      <OptionButton
        icon={FiFileText}
        title="Describe Project"
        desc="Just tell us what you need. We'll generate a brief"
        onClick={() => onSelect('describe')}
      />
      <OptionButton
        icon={FilePlus}
        title="Create Project"
        desc="Craft your own brief. Choose copy, visuals and layouts"
        onClick={() => onSelect('brief')}
      />
    </div>
    <div className="flex justify-end gap-2">
      <button className="btn" onClick={onClose}>Cancel</button>
    </div>
  </Modal>
);

export default SelectProjectTypeModal;
