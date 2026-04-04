import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '../context/AuthContext';
import api from '../utils/api';
import toast from 'react-hot-toast';
import './AdminTemplateManagementPage.css';

export default function AdminTemplateManagementPage() {
  const { user, isAdmin } = useAuth();
  const [templates, setTemplates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editingTemplate, setEditingTemplate] = useState(null);
  const [formData, setFormData] = useState({
    name: '',
    template_content: ''
  });
  const [selectedPdf, setSelectedPdf] = useState(null);
  const pdfInputRef = useRef(null);

  useEffect(() => {
    if (!isAdmin) return;
    loadTemplates();
  }, [isAdmin]);

  const loadTemplates = async () => {
    try {
      setLoading(true);
      const response = await api.get('/templates');
      setTemplates(response.data);
    } catch (error) {
      toast.error('Failed to load templates');
      console.error('Error loading templates:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleTemplateSelect = (template) => {
    setEditingTemplate(template.id);
    setFormData({
      name: template.name,
      template_content: template.template_content
    });
    setSelectedPdf(null);
  };

  const handleClear = () => {
    setEditingTemplate(null);
    setFormData({ name: '', template_content: '' });
    setSelectedPdf(null);
  };

  const handleSaveTemplate = async (e) => {
    e.preventDefault();
    try {
      setLoading(true);

      if (!formData.name || !formData.template_content) {
        toast.error('Template name and content are required');
        return;
      }

      if (editingTemplate) {
        await api.put(`/templates/${editingTemplate}`, formData);
        toast.success('Template updated successfully');
      } else {
        await api.post('/templates', formData);
        toast.success('Template created successfully');
      }

      await loadTemplates();
      handleClear();
    } catch (error) {
      toast.error(error.response?.data?.error || 'Failed to save template');
    } finally {
      setLoading(false);
    }
  };

  const handleActivateTemplate = async (templateId) => {
    try {
      await api.put(`/templates/${templateId}`, { is_active: true });
      toast.success('Template activated');
      await loadTemplates();
    } catch (error) {
      toast.error('Failed to activate template');
    }
  };

  const handleDeleteTemplate = async (templateId) => {
    if (!window.confirm('Are you sure you want to delete this template?')) return;

    try {
      await api.delete(`/templates/${templateId}`);
      toast.success('Template deleted successfully');
      if (editingTemplate === templateId) handleClear();
      await loadTemplates();
    } catch (error) {
      toast.error(error.response?.data?.error || 'Failed to delete template');
    }
  };

  const handleUploadPdf = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    if (file.type !== 'application/pdf') {
      toast.error('Only PDF files allowed');
      return;
    }

    if (!editingTemplate) {
      toast.error('Please select a template first');
      return;
    }

    try {
      setLoading(true);
      const formDataPdf = new FormData();
      formDataPdf.append('pdf_template', file);

      const response = await api.post(`/templates/${editingTemplate}/upload-pdf`, formDataPdf, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });

      setSelectedPdf(file.name);
      toast.success('PDF template uploaded successfully');
      await loadTemplates();
    } catch (error) {
      toast.error(error.response?.data?.error || 'Failed to upload PDF');
      console.error('Error:', error);
    } finally {
      setLoading(false);
      if (pdfInputRef.current) pdfInputRef.current.value = '';
    }
  };

  const handleDownloadPdf = async (templateId) => {
    try {
      const response = await api.get(`/templates/${templateId}/download-pdf`, { responseType: 'blob' });
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `template.pdf`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (error) {
      toast.error('Failed to download PDF');
    }
  };

  if (!isAdmin) {
    return <div className="admin-page"><p>Admin access required</p></div>;
  }

  if (loading && templates.length === 0) {
    return <div className="admin-page"><p>Loading...</p></div>;
  }

  return (
    <div className="admin-page template-management-page">
      <div className="page-header">
        <h1>🏷️ Machine Job Card Template Management</h1>
        <p>Customize the Machine Job Card format and upload PDF templates for report generation</p>
      </div>

      <div className="template-management-container">
        {/* Template List */}
        <div className="template-list-section">
          <h2>Available Templates</h2>
          {templates.length === 0 ? (
            <p className="no-templates">No templates found</p>
          ) : (
            <div className="template-list">
              {templates.map((template) => (
                <div
                  key={template.id}
                  className={`template-item ${editingTemplate === template.id ? 'active' : ''} ${template.is_active ? 'is-active' : ''}`}
                  onClick={() => handleTemplateSelect(template)}
                >
                  <div className="template-info">
                    <h3>{template.name}</h3>
                    {template.is_active && <span className="badge badge-active">Active</span>}
                    {template.is_pdf_based && <span className="badge badge-pdf">PDF</span>}
                  </div>
                  <div className="template-actions">
                    {!template.is_active && (
                      <button
                        type="button"
                        className="btn btn-sm btn-primary"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleActivateTemplate(template.id);
                        }}
                      >
                        Activate
                      </button>
                    )}
                    <button
                      type="button"
                      className="btn btn-sm btn-danger"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDeleteTemplate(template.id);
                      }}
                    >
                      Delete
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Template Editor */}
        <div className="template-editor-section">
          <h2>{editingTemplate ? 'Edit Template' : 'Create New Template'}</h2>

          <form onSubmit={handleSaveTemplate} className="template-form">
            <div className="form-group">
              <label>Template Name *</label>
              <input
                type="text"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="e.g., DCTC Standard, Custom Layout"
                required
              />
            </div>

            <div className="form-group">
              <label>Template Content *</label>
              <p className="help-text">Use {'{variable_name}'} for dynamic fields. Available variables:</p>
              <div className="variables-grid">
                <span>{'{{job_card_number}}'}</span>
                <span>{'{{job_name}}'}</span>
                <span>{'{{part_number}}'}</span>
                <span>{'{{item_code}}'}</span>
                <span>{'{{material}}'}</span>
                <span>{'{{dimension}}'}</span>
                <span>{'{{tolerance}}'}</span>
                <span>{'{{surface_finish}}'}</span>
                <span>{'{{pr_number}}'}</span>
                <span>{'{{po_number}}'}</span>
                <span>{'{{quantity}}'}</span>
                <span>{'{{manufacturing_orders}}'}</span>
                <span>{'{{priority}}'}</span>
                <span>{'{{machine_name}}'}</span>
                <span>{'{{client_name}}'}</span>
                <span>{'{{job_date}}'}</span>
                <span>{'{{drawing_number}}'}</span>
                <span>{'{{estimated_delivery_date}}'}</span>
                <span>{'{{generated_date}}'}</span>
              </div>

              <textarea
                value={formData.template_content}
                onChange={(e) => setFormData({ ...formData, template_content: e.target.value })}
                placeholder="Enter template content with {{variable}} placeholders"
                rows="15"
                required
              />
            </div>

            {editingTemplate && (
              <div className="pdf-upload-section">
                <h3>📄 PDF Template (Optional)</h3>
                <p className="help-text">Upload a PDF template to use as the base for this job card template</p>
                
                <div className="pdf-upload-box">
                  <input
                    ref={pdfInputRef}
                    type="file"
                    accept=".pdf"
                    onChange={handleUploadPdf}
                    disabled={loading}
                    hidden
                  />
                  <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={() => pdfInputRef.current?.click()}
                    disabled={loading}
                  >
                    📤 Upload PDF Template
                  </button>
                  
                  {selectedPdf && <p className="selected-file">Selected: {selectedPdf}</p>}
                  
                  {templates.find(t => t.id === editingTemplate)?.is_pdf_based && (
                    <div className="pdf-template-info">
                      <p>✓ PDF template uploaded</p>
                      <button
                        type="button"
                        className="btn btn-sm btn-outline"
                        onClick={() => handleDownloadPdf(editingTemplate)}
                      >
                        📥 Download Current PDF
                      </button>
                    </div>
                  )}
                </div>
              </div>
            )}

            <div className="form-actions">
              <button type="submit" className="btn btn-primary" disabled={loading}>
                {loading ? 'Saving...' : editingTemplate ? 'Update Template' : 'Create Template'}
              </button>
              {editingTemplate && (
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={handleClear}
                  disabled={loading}
                >
                  Clear
                </button>
              )}
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
