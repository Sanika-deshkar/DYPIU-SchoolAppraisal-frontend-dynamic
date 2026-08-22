import React from 'react';

export const DynamicField = ({ field, value, onChange, readOnly = false, error = null }) => {
  if (!field) return null;

  const {
    fieldKey,
    idString,
    label,
    fieldType = 'TEXT',
    kind,
    isRequired = false,
    placeholder = '',
    options = [],
    validationRules = {},
  } = field;

  const key = fieldKey || idString || 'field';
  const displayLabel = label || key;

  if (kind === 'heading') {
    return (
      <div className="dynamic-field-heading my-3">
        <h5 className="text-primary fw-bold">{displayLabel}</h5>
      </div>
    );
  }

  const handleChange = (e) => {
    onChange(key, e.target.value);
  };

  switch (fieldType.toUpperCase()) {
    case 'TEXTAREA':
      return (
        <div className="dynamic-field form-group mb-3">
          <label className="form-label fw-semibold">
            {displayLabel} {isRequired && <span className="text-danger">*</span>}
          </label>
          <textarea
            className={`form-control ${error ? 'is-invalid' : ''}`}
            rows={3}
            placeholder={placeholder}
            disabled={readOnly}
            maxLength={validationRules?.maxLength || 2000}
            value={value ?? ''}
            onChange={handleChange}
          />
          {error && <div className="invalid-feedback">{error}</div>}
        </div>
      );

    case 'SELECT':
      return (
        <div className="dynamic-field form-group mb-3">
          <label className="form-label fw-semibold">
            {displayLabel} {isRequired && <span className="text-danger">*</span>}
          </label>
          <select
            className={`form-select ${error ? 'is-invalid' : ''}`}
            disabled={readOnly}
            value={value ?? ''}
            onChange={handleChange}
          >
            <option value="">-- Select --</option>
            {options && options.map((opt, i) => (
              <option key={i} value={opt}>
                {opt}
              </option>
            ))}
          </select>
          {error && <div className="invalid-feedback">{error}</div>}
        </div>
      );

    case 'NUMBER':
      return (
        <div className="dynamic-field form-group mb-3">
          <label className="form-label fw-semibold">
            {displayLabel} {isRequired && <span className="text-danger">*</span>}
          </label>
          <input
            type="number"
            className={`form-control ${error ? 'is-invalid' : ''}`}
            placeholder={placeholder}
            disabled={readOnly}
            min={validationRules?.min}
            max={validationRules?.max}
            value={value ?? ''}
            onChange={handleChange}
          />
          {error && <div className="invalid-feedback">{error}</div>}
        </div>
      );

    case 'DATE':
      return (
        <div className="dynamic-field form-group mb-3">
          <label className="form-label fw-semibold">
            {displayLabel} {isRequired && <span className="text-danger">*</span>}
          </label>
          <input
            type="date"
            className={`form-control ${error ? 'is-invalid' : ''}`}
            disabled={readOnly}
            value={value ?? ''}
            onChange={handleChange}
          />
          {error && <div className="invalid-feedback">{error}</div>}
        </div>
      );

    case 'EMAIL':
      return (
        <div className="dynamic-field form-group mb-3">
          <label className="form-label fw-semibold">
            {displayLabel} {isRequired && <span className="text-danger">*</span>}
          </label>
          <input
            type="email"
            className={`form-control ${error ? 'is-invalid' : ''}`}
            placeholder={placeholder || 'example@domain.com'}
            disabled={readOnly}
            value={value ?? ''}
            onChange={handleChange}
          />
          {error && <div className="invalid-feedback">{error}</div>}
        </div>
      );

    case 'URL':
      return (
        <div className="dynamic-field form-group mb-3">
          <label className="form-label fw-semibold">
            {displayLabel} {isRequired && <span className="text-danger">*</span>}
          </label>
          <input
            type="url"
            className={`form-control ${error ? 'is-invalid' : ''}`}
            placeholder={placeholder || 'https://...'}
            disabled={readOnly}
            value={value ?? ''}
            onChange={handleChange}
          />
          {error && <div className="invalid-feedback">{error}</div>}
        </div>
      );

    case 'TEXT':
    default:
      return (
        <div className="dynamic-field form-group mb-3">
          <label className="form-label fw-semibold">
            {displayLabel} {isRequired && <span className="text-danger">*</span>}
          </label>
          <input
            type="text"
            className={`form-control ${error ? 'is-invalid' : ''}`}
            placeholder={placeholder}
            disabled={readOnly}
            value={value ?? ''}
            onChange={handleChange}
          />
          {error && <div className="invalid-feedback">{error}</div>}
        </div>
      );
  }
};
