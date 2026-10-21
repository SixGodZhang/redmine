# frozen_string_literal: true

module Studio
  class RolesController < BaseController
    before_action :require_admin
    before_action :find_role, only: [:update, :destroy]

    def permission_catalog
      grouped = Hash.new { |hash, key| hash[key] = [] }
      Role.new.setable_permissions.each do |permission|
        mod = permission.project_module.presence || :project
        grouped[mod] << {
          name: permission.name.to_s,
          label: permission_label(permission.name)
        }
      end
      modules = grouped.map do |mod, permissions|
        {
          module: mod.to_s,
          label: mod == :project ? '项目' : module_label(mod),
          permissions: permissions
        }
      end
      render json: { modules: modules }
    end

    def create
      role = Role.new
      role.safe_attributes = params[:role]
      if role.save
        render json: { role: role_json(role) }, status: :created
      else
        render json: { errors: role.errors.full_messages }, status: :unprocessable_entity
      end
    end

    def update
      @role.safe_attributes = params[:role]
      if @role.save
        render json: { role: role_json(@role) }
      else
        render json: { errors: @role.errors.full_messages }, status: :unprocessable_entity
      end
    end

    def destroy
      if @role.builtin?
        render json: { errors: ['系统内置角色不能删除'] }, status: :unprocessable_entity
        return
      end
      if @role.members.any?
        usage = @role.members.includes(:project, :principal).map do |member|
          "#{member.project&.name} / #{member.principal&.name}"
        end
        render json: { errors: ["该角色仍被使用，请先移除这些成员后再删除：#{usage.join('，')}"] }, status: :unprocessable_entity
        return
      end
      @role.destroy
      render json: { ok: true }
    end

    private

    def find_role
      @role = Role.find(params[:id])
    end

    def permission_label(name)
      I18n.t("permission_#{name}", locale: :zh, default: name.to_s).to_s.gsub('问题', '工单')
    end

    def module_label(name)
      I18n.t("project_module_#{name}", locale: :zh, default: name.to_s).to_s.gsub('问题', '工单')
    end

    def role_json(role)
      {
        id: role.id,
        name: role.name,
        assignable: role.assignable?,
        issues_visibility: role.issues_visibility,
        users_visibility: role.users_visibility,
        time_entries_visibility: role.time_entries_visibility,
        permissions: role.permissions,
        builtin: role.builtin?
      }
    end
  end
end
