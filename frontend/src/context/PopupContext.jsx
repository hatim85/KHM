import React, { createContext, useContext, useState, useCallback } from 'react';
import Popup from '../components/Popup';

const PopupContext = createContext(null);

export const usePopup = () => {
  const context = useContext(PopupContext);
  if (!context) {
    throw new Error('usePopup must be used within a PopupProvider');
  }
  return context;
};

export const PopupProvider = ({ children }) => {
  const [popupState, setPopupState] = useState({
    isOpen: false,
    message: '',
    type: 'alert',
    onConfirm: null,
    onCancel: null,
  });

  const showAlert = useCallback((message) => {
    return new Promise((resolve) => {
      setPopupState({
        isOpen: true,
        message,
        type: 'alert',
        onConfirm: () => {
          setPopupState((prev) => ({ ...prev, isOpen: false }));
          resolve(true);
        },
      });
    });
  }, []);

  const showConfirm = useCallback((message) => {
    return new Promise((resolve) => {
      setPopupState({
        isOpen: true,
        message,
        type: 'confirm',
        onConfirm: () => {
          setPopupState((prev) => ({ ...prev, isOpen: false }));
          resolve(true);
        },
        onCancel: () => {
          setPopupState((prev) => ({ ...prev, isOpen: false }));
          resolve(false);
        },
      });
    });
  }, []);

  return (
    <PopupContext.Provider value={{ showAlert, showConfirm }}>
      {children}
      <Popup
        isOpen={popupState.isOpen}
        message={popupState.message}
        type={popupState.type}
        onConfirm={popupState.onConfirm}
        onCancel={popupState.onCancel}
      />
    </PopupContext.Provider>
  );
};
