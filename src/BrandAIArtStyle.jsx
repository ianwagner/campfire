import React, { useState } from 'react';
import PageWrapper from './components/PageWrapper.jsx';
import FormField from './components/FormField.jsx';

const BrandAIArtStyle = () => {
  const [style, setStyle] = useState('');

  return (
    <PageWrapper title="AI Art Style">
      <form className="space-y-4 max-w-md">
        <FormField label="AI Art Style">
          <textarea
            value={style}
            onChange={(e) => setStyle(e.target.value)}
            className="w-full p-2 border rounded"
          />
        </FormField>
      </form>
    </PageWrapper>
  );
};

export default BrandAIArtStyle;
