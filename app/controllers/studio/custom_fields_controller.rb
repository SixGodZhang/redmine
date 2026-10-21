# frozen_string_literal: true

module Studio
  class CustomFieldsController < BaseController
    before_action :require_admin, except: [:issue_form, :columns]
    before_action :require_studio_login, only: [:issue_form, :columns]
    before_action :find_custom_field, only: [:update, :destroy]

    TYPES = {
      'IssueCustomField' => '工单',
      'ProjectCustomField' => '项目',
      'UserCustomField' => '用户',
      'TimeEntryCustomField' => '时间',
      'VersionCustomField' => '版本'
    }.freeze

    def index
      I18n.locale = :zh
      render json: {
        fields: CustomField.sorted.map { |field| field_json(field) },
        types: TYPES.map { |value, label| { value: value, label: label } },
        formats: format_options('IssueCustomField'),
        formats_by_type: TYPES.keys.index_with { |type| format_options(type) },
        roles: Role.givable.map { |role| { id: role.id, name: role.name } },
        groups: Group.givable.map { |group| { id: group.id, name: group.name } },
        trackers: Tracker.sorted.map { |tracker| { id: tracker.id, name: tracker.name } },
        projects: Project.sorted.map { |project| { id: project.id, name: project.name } }
      }
    end

    def create
      klass = TYPES.key?(params[:type]) ? params[:type].constantize : nil
      return render json: { errors: ['请选择字段用于哪种对象'] }, status: :unprocessable_entity unless klass

      field = klass.new
      apply_attributes(field)
      return render json: { errors: field.errors.full_messages }, status: :unprocessable_entity if field.errors.any?

      if field.save
        render json: { field: field_json(field) }, status: :created
      else
        render json: { errors: field.errors.full_messages }, status: :unprocessable_entity
      end
    end

    def update
      apply_attributes(@field)
      return render json: { errors: @field.errors.full_messages }, status: :unprocessable_entity if @field.errors.any?

      if @field.save
        render json: { field: field_json(@field) }
      else
        render json: { errors: @field.errors.full_messages }, status: :unprocessable_entity
      end
    end

    def columns
      I18n.locale = :zh
      scope = IssueCustomField.sorted
      if params[:project_id].present?
        project = Project.find_by(id: params[:project_id])
        return render json: { errors: ['项目不存在'] }, status: :not_found unless project

        scope = project.all_issue_custom_fields
      end
      fields = scope.visible.sorted.map do |field|
        { id: field.id, name: field.name, field_format: field.field_format }
      end
      render json: { fields: fields }
    end

    def issue_form
      I18n.locale = :zh
      project = Project.find_by(id: params[:project_id])
      tracker = Tracker.find_by(id: params[:tracker_id])
      return render json: { errors: ['请选择项目和跟踪标签'] }, status: :unprocessable_entity unless project && tracker

      issue = params[:issue_id].present? ? Issue.find(params[:issue_id]) : Issue.new(author: User.current)
      issue.project = project
      issue.tracker = tracker
      issue.status = IssueStatus.find_by(id: params[:status_id]) if params[:status_id].present?

      fields = issue.editable_custom_field_values.map { |custom_value| issue_field_json(custom_value, issue) }
      render json: { fields: fields }
    end

    def destroy
      @field.destroy
      render json: { ok: true }
    rescue StandardError => e
      render json: { errors: [e.message] }, status: :unprocessable_entity
    end

    private

    def find_custom_field
      @field = CustomField.find(params[:id])
    end

    def apply_attributes(field)
      attrs = params[:custom_field].presence || {}
      attrs = attrs.to_unsafe_hash if attrs.respond_to?(:to_unsafe_hash)
      attrs = attrs.deep_dup
      project_ids = Array(attrs.delete('project_ids') || attrs.delete(:project_ids)).reject(&:blank?).map(&:to_i)
      group_ids = Array(attrs.delete('group_ids') || attrs.delete(:group_ids)).reject(&:blank?).map(&:to_i)
      field.safe_attributes = attrs
      assign_group_ids(field, group_ids)
      return unless field.is_a?(IssueCustomField)

      field.is_for_all = ActiveModel::Type::Boolean.new.cast(attrs['is_for_all'] || attrs[:is_for_all])
      field.is_for_all = true if !attrs.key?('is_for_all') && !attrs.key?(:is_for_all) && field.new_record?
      ids = Array(attrs['tracker_ids'] || attrs[:tracker_ids]).reject(&:blank?)
      field.tracker_ids = ids.presence || (field.new_record? ? Tracker.ids : field.tracker_ids)
      if !field.is_for_all? && project_ids.empty?
        field.errors.add(:base, '请至少选择一个项目')
      else
        field.project_ids = field.is_for_all? ? [] : project_ids
      end
    end

    def assign_group_ids(field, group_ids)
      store = field.format_store.is_a?(Hash) ? field.format_store.deep_dup : {}
      store = store.stringify_keys
      unless field.field_format == 'user'
        store.delete('group_ids')
        field.format_store = store
        return
      end

      known = Group.givable.where(id: group_ids).pluck(:id)
      if known.empty?
        field.errors.add(:base, '请至少选择一个用户组')
        return
      end

      store['group_ids'] = known
      store['user_role'] = []
      field.format_store = store
    end

    def group_ids_for(field)
      store = field.format_store
      return [] unless store.is_a?(Hash)

      Array(store['group_ids'] || store[:group_ids]).reject(&:blank?).map(&:to_i)
    end

    def group_member_options(field)
      ids = group_ids_for(field)
      return nil unless field.field_format == 'user' && ids.any?

      table = User.reflect_on_association(:groups).join_table
      member_ids = User.connection.select_values(
        User.sanitize_sql_array(["SELECT DISTINCT user_id FROM #{table} WHERE group_id IN (?)", ids])
      )
      User.active.where(id: member_ids).sorted.map do |user|
        { label: user.name, value: user.id.to_s }
      end
    end

    def issue_field_json(custom_value, issue)
      field = custom_value.custom_field
      options = group_member_options(field)
      options ||= Array(field.format.possible_values_options(field, issue)).map do |option|
        if option.is_a?(Array)
          { label: option.first.to_s, value: (option.last || option.first).to_s }
        else
          { label: option.to_s, value: option.to_s }
        end
      end
      raw = custom_value.value
      {
        id: field.id,
        name: field.name,
        description: field.description,
        field_format: field.field_format,
        multiple: field.multiple?,
        required: field.is_required? || issue.required_attribute?(field.id),
        value: raw.is_a?(Array) ? raw.reject(&:blank?) : raw.to_s,
        options: options
      }
    end

    def format_options(custom_field_type)
      customized = {
        'IssueCustomField' => 'Issue',
        'ProjectCustomField' => 'Project',
        'UserCustomField' => 'User',
        'TimeEntryCustomField' => 'TimeEntry',
        'VersionCustomField' => 'Version'
      }[custom_field_type]
      Redmine::FieldFormat.as_select(customized).map do |label, value|
        { value: value, label: label.to_s.gsub('问题', '工单') }
      end
    end

    def field_json(field)
      I18n.locale = :zh
      {
        id: field.id,
        name: field.name,
        description: field.description,
        type: field.type,
        type_label: TYPES[field.type] || field.type,
        field_format: field.field_format,
        format_label: I18n.t(field.format.label, default: field.field_format).to_s.gsub('问题', '工单'),
        is_required: field.is_required?,
        is_for_all: field.is_for_all?,
        possible_values: field.possible_values,
        trackers: field.is_a?(IssueCustomField) ? field.trackers.map { |tracker| { id: tracker.id, name: tracker.name } } : [],
        projects: field.is_a?(IssueCustomField) ? field.projects.map { |project| { id: project.id, name: project.name } } : [],
        user_role: Array(field.user_role).reject(&:blank?).map(&:to_i),
        group_ids: group_ids_for(field),
        possible_principals: field.possible_principals.presence || 'user'
      }
    end
  end
end
