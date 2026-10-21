# frozen_string_literal: true

module Studio
  class VersionsController < BaseController
    before_action :find_project_by_project_id
    before_action :require_manage, only: [:create, :destroy]

    def index
      render json: {
        can_manage: can_manage?,
        versions: versions_json
      }
    end

    def create
      version = @project.versions.build
      version.safe_attributes = { 'name' => params[:name].to_s.strip }
      if version.save
        render json: { version: { id: version.id, name: version.name } }, status: :created
      else
        render json: { errors: version.errors.full_messages }, status: :unprocessable_entity
      end
    end

    def destroy
      version = @project.versions.find(params[:id])
      unless version.deletable?
        render json: { errors: ['该目标版本已被工单使用，不能删除'] }, status: :unprocessable_entity
        return
      end
      version.destroy
      render json: { ok: true }
    end

    private

    def can_manage?
      User.current.admin? || User.current.allowed_to?(:manage_versions, @project)
    end

    def require_manage
      return if can_manage?

      render json: { errors: ['只有项目管理员可以维护目标版本'] }, status: :forbidden
    end

    def versions_json
      @project.shared_versions.sort.map { |version| { id: version.id, name: version.name } }
    end
  end
end
