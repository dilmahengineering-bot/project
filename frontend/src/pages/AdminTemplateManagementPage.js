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
  const [selectedFile, setSelectedFile] = useState(null);
  const fileInputRef = useRef(null);

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
    setSelectedFile(null);
  };

  const handleClear = () => {
    setEditingTemplate(null);
    setFormData({ name: '', template_content: '' });
    setSelectedFile(null);
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

  const handleUploadDocx = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const validTypes = [
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/pdf'
    ];

    if (!validTypes.includes(file.type)) {
      toast.error('Only .docx files are allowed');
      return;
    }

    if (!editingTemplate) {
      toast.error('Please select a template first');
      return;
    }

    try {
      setLoading(true);
      const uploadData = new FormData();
      uploadData.append('pdf_template', file);

      await api.post(`/templates/${editingTemplate}/upload-pdf`, uploadData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });

      setSelectedFile(file.name);
      toast.success('Word template uploaded successfully!');
      await loadTemplates();
    } catch (error) {
      toast.error(error.response?.data?.error || 'Failed to upload template');
      console.error('Upload error:', error);
    } finally {
      setLoading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleDownloadTemplate = async (templateId) => {
    try {
      const response = await api.get(`/templates/${templateId}/download-pdf`, { responseType: 'blob' });
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `template.docx`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (error) {
      toast.error('Failed to download template');
    }
  };

  if (!isAdmin) {
    return <div className="admin-page"><p>Admin access required</p></div>;
  }

  if (loading && templates.length === 0) {
    return <div className="admin-page"><p>Loading...</p></div>;
  }

  const currentTemplate = templates.find(t => t.id === editingTemplate);

  return (
    <div className="admin-page template-management-page">
      <div className="page-header">
        <h1>Machine Job Card Template Management</h1>
        <p>Upload a Word (.docx) template with variable placeholders. When generating a job card, all variables will be filled with real job data and downloaded as a Word document with your exact layout.</p>
      </div>

      <div className="template-management-container">
        {/* Template List */}
        <div className="template-list-section">
          <h2>Templates</h2>
          {templates.length === 0 ? (
            <p className="no-templates">No templates found. Create one below.</p>
          ) : (
            <div className="template-list">
              {templates.map((tmpl) => (
                <div
                  key={tmpl.id}
                  className={`template-item ${editingTemplate === tmpl.id ? 'active' : ''} ${tmpl.is_active ? 'is-active' : ''}`}
                  onClick={() => handleTemplateSelect(tmpl)}
                >
                  <div className="template-info">
                    <h3>{tmpl.name}</h3>
                    <div className="template-badges">
                      {tmpl.is_active && <span className="badge badge-active">Active</span>}
                      {tmpl.is_pdf_based && <span className="badge badge-docx">DOCX Uploaded</span>}
                    </div>
                  </div>
                  <div className="template-actions">
                    {!tmpl.is_active && (
                      <button type="button" className="btn btn-sm btn-primary" onClick={(e) => { e.stopPropagation(); handleActivateTemplate(tmpl.id); }}>
                        Activate
                      </button>
                    )}
                    <button type="button" className="btn btn-sm btn-danger" onClick={(e) => { e.stopPropagation(); handleDeleteTemplate(tmpl.id); }}>
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
                placeholder="e.g., DCTC Standard Job Card"
                required
              />
            </div>

            <div className="form-group">
              <label>Text Template Content *</label>
              <p className="help-text">This is used as fallback when no Word template is uploaded. Use {'{{variable_name}}'} for dynamic fields.</p>
              <textarea
                value={formData.template_content}
                onChange={(e) => setFormData({ ...formData, template_content: e.target.value })}
                placeholder="Enter template content with {{variable}} placeholders"
                rows="12"
                required
              />
            </div>

            <div className="form-actions">
              <button type="submit" className="btn btn-primary" disabled={loading}>
                {loading ? 'Saving...' : editingTemplate ? 'Update Template' : 'Create Template'}
              </button>
              {editingTemplate && (
                <button type="button" className="btn btn-secondary" onClick={handleClear} disabled={loading}>
                  Cancel
                </button>
              )}
            </div>
          </form>

          {/* Word Template Upload - only when editing */}
          {editingTemplate && (
            <div className="docx-upload-section">
              <h3>Word Template (.docx)</h3>
              <p className="help-text">
                Upload your Word document with {'{{variable_name}}'} placeholders. 
                The generated job card will preserve your exact Word layout — tables, fonts, borders, images — with all variables filled.
              </p>

              <div className="variables-grid">
                <span>{'{{job_card_number}}'}</span>
                <span>{'{{job_name}}'}</span>
                <span>{'{{job_date}}'}</span>
                <span>{'{{part_number}}'}</span>
                <span>{'{{item_code}}'}</span>
                <span>{'{{drawing_number}}'}</span>
                <span>{'{{machine_name}}'}</span>
                <span>{'{{client_name}}'}</span>
                <span>{'{{priority}}'}</span>
                <span>{'{{manufacturing_type}}'}</span>
                <span>{'{{estimated_delivery_date}}'}</span>
                <span>{'{{quantity}}'}</span>
                <span>{'{{material}}'}</span>
                <span>{'{{dimension}}'}</span>
                <span>{'{{tolerance}}'}</span>
                <span>{'{{surface_finish}}'}</span>
                <span>{'{{pr_number}}'}</span>
                <span>{'{{po_number}}'}</span>
                <span>{'{{manufacturing_orders}}'}</span>
                <span>{'{{subjob_card_number}}'}</span>
                <span>{'{{status}}'}</span>
                <span>{'{{notes}}'}</span>
                <span>{'{{assigned_to}}'}</span>
                <span>{'{{workflow_name}}'}</span>
                <span>{'{{stage_name}}'}</span>
                <span>{'{{generated_date}}'}</span>
              </div>

              <div className="image-variable-info">
                <h4>Reference Image</h4>
                <p>To include the job's reference image in your Word template, add this tag where you want the image:</p>
                <code>{'{{%reference_image}}'}</code>
                <p className="help-text">The % prefix tells the system this is an image, not text. Image appears at 300x200px. If no image is uploaded for a job, the tag will be removed.</p>
              </div>
              
              <div className="docx-upload-box">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".docx"
                  onChange={handleUploadDocx}
                  disabled={loading}
                  hidden
                />
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={loading}
                >
                  Upload Word Template (.docx)
                </button>
                
                {selectedFile && <p className="selected-file">Uploaded: {selectedFile}</p>}
                
                {currentTemplate?.is_pdf_based && (
                  <div className="docx-template-status">
                    <span className="status-ok">Word template is active</span>
                    <button
                      type="button"
                      className="btn btn-sm btn-outline"
                      onClick={() => handleDownloadTemplate(editingTemplate)}
                    >
                      Download Current Template
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
